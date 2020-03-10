// server.js

// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var assert     = require('assert');
var crypto     = require('crypto');
var dots       = require("dot").process({path: "./views", templateSettings: {strip: false}});
var lescape    = require('escape-latex');
var crypto     = require('crypto');
var merge      = require('object-mapper').merge;
var fs         = require('fs');
var invoicer   = require('./invoicer');
var groups     = require('./groups');

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser());

var port = process.env.PORT || 80;        // set our port

// CiviCRM
var config = {
  server: process.env.CIVICRM_SERVER,
  path: process.env.CIVICRM_PATH,
  key: process.env.CIVICRM_SITE_KEY,
  api_key: process.env.CIVICRM_API_KEY,
};

var crmAPI = require('./civicrm')(config);

// BitPay
var bitpay = require('bitpay');
var bitpay_privkey    = process.env.BITPAY_PRIVKEY;
var bitpay_mode       = process.env.BITPAY_MODE;
var bitpay_config = {
		'prod': {config: {"apiHost": "bitpay.com", "apiPort": 443}},
		'test': {config: {"apiHost": "test.bitpay.com", "apiPort": 443}},
		};

// Stripe
var stripe =  require('stripe')(process.env.STRIPE_SECRET_KEY);

// secrets to protect API
var api_secret = crypto.randomBytes(10).toString('hex'); // random secret used for internal links
var secrets = process.env.PPSAPI_SECRETS.split(',');
secrets.push(api_secret);

// to access the API, the following hash needs to be generated
// sha1(secret + ":" + f1 + "/" + leftover).substring(0,20)
// e.g. http://localhost:8080/members/hash/blabla would result in
// sha1(secret:members/blabla).substring(0,20) only half of the hash is used

var paylink_base =  process.env.PPSAPI_PAYLINKURL || "https://api.test.piratenpartei.ch";
var paylink_secret = process.env.PPSAPI_PAYSECRET;

var api_base =  process.env.PPSAPI_BASEURL || "https://api.test.piratenpartei.ch/api/v1";

map_preferred_language = {'de': 'de_CH', 'fr': 'fr_FR', 'en': 'en_GB', 'it': 'it_IT'}
map_gender = {'male': '1', 'female': '2'};

fieldmap_new_member_contact = {
        'uniqueIdentifier': 'external_identifier',
	'username': {
		key: 'nick_name',
	},
	'language': {
		key: 'preferred_language',
		transform: function(value, objFrom, objTo) {
			return map_preferred_language[value];
		},
		default: function(objFrom, objTo) {
			return "de_CH";
		},
	},
        'section': {
		key: 'custom5',
	},
	'gender': {
		key: 'gender_id',
		transform: function(value, objFrom, objTo) {
			return map_gender[value];
		},
	},
	'surname': {
		key: 'last_name',
	},
	'givenname': {
		key: 'first_name',
	},
	'birthdate': {
		key: 'birth_date',
	},
	'phone': {
		key: 'phone',
	},
	'email': {
		key: 'email',
	},
};

fieldmap_new_member_address = {
	'country': {
		key: 'country',
	},
	'state': {
		key: 'state_province',
	},
	'street': {
		key: 'street_address',
	},
	'location': {
		key: 'city',
	},
	'postalcode': {
		key: 'postal_code',
	},
};

function map_new_member(entry) {
        return merge(entry, {}, fieldmap_new_member);
}

function sha1(value) {
	var shasum = crypto.createHash('sha1');

	shasum.update(value);
	return shasum.digest('hex');
}

function recursive_lescape(value) {
	if (value && value.constructor == String) {
		value = lescape(value)
	} else { // array
		for (var i in value) {
			value[i] = recursive_lescape(value[i])
		}
	}
	return value;
}

// Fetch Membership fees and cache them
var membership_types = {};
crmAPI.get ('MembershipType',{is_active: 1, return:'name,minimum_fee,description'},
	function (result) {
		for (var i in result.values) {
			var mt = result.values[i]
			membership_types[mt.name] = mt;
		};
	}
);

function contains(list, item) {
        for (var i in list) {
                if (list[i] == item)
                        return true;
        }

        return false;
}

const NEWSLETTER_POLITICS_ID = "7";
const NEWSLETTER_ACTIONS_ID = "8";
const NEWSLETTER_EVENTS_ID = "9";
const NEWSLETTER_ASSEMBLIES_ID = "10";
const NEWSLETTER_VOTINGS_ID = "11";

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
    res.json({ message: 'Welcome to the pps api! Contact finance@piratenpartei.ch for more info.' });   
});

// authentication checks
router.use('/:f1/:auth_key/*',
	function (req, res, next) {
		var match = 0;
		var key = req.params.f1 + "/" + req.params[0];
		for (var i in secrets) {
			var tohash = secrets[i] + ':' + key;
			var hash = sha1(tohash).substring(0,20);
			if (hash == req.params.auth_key) // match
				match = 1;
			console.log("Hash: "+tohash+ ":" + hash);
		}
		if (match) { // yes, you're allowed
			next();
		} else {
			res.status(403)
				.send('Access denied');
		}
});

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function get_member_data(member_id, callback) {
	crmAPI.get ('contact',{contact_type:'Individual', external_identifier: member_id, return:'preferred_communication_method,email_greeting_display,postal_greeting_display,display_name,first_name,last_name,email,phone,street_address,postal_code,city,country,gender_id'},
		function (result) {
			var ret={};
			if (result.values && result.values.length==1) {
				var contact = result.values[0];
				ret = contact;
				console.log(contact.id +": "+contact.display_name+ " "+contact.email+ " "+ contact.phone);
				crmAPI.get ('membership',{contact_id: contact.contact_id},
					function (result) {
						var total_fee = 0;
						// set empty for template handling
						ret.level1 = {description: ""};
						ret.level2 = {description: ""};
						ret.level3 = {description: ""};

						for (var i in result.values) {
							var val = result.values[i];

							// add info from membership_types e.g. price and section name
							val.minimum_fee = membership_types[val.membership_name].minimum_fee;
							val.description = membership_types[val.membership_name].description;

							total_fee = total_fee + parseInt(val.minimum_fee);

							// TODO, this is a hackish selection of section levels (PPS, PPXX and PPCITYNAME)
							var basename = val.membership_name.split('-')[0]; //remove variants "-Reduced" ...
							if(basename.length == 3)
								ret.level1 = val
							else if(basename.length == 4)
								ret.level2 = val
							else
								ret.level3 = val
						}
						ret.minimum_fee = total_fee.toFixed(2);
						// construct invoice number and ESR
						ret.invoicenr = "16" + pad(ret.external_identifier, 6, 0);
						ret.esrreference = ret.invoicenr;
						ret.esrprefix = "01" + "00000" + pad(ret.external_identifier, 5, 0) + "20170";
						ret.paylink = paylink_base + "/pay/" + sha1(paylink_secret + ":pay/" + ret.external_identifier).substring(0,20) + "/" + ret.external_identifier;
						if (callback)
							callback(ret);
					}
				);
			} else {
				if (callback)
					callback(ret);
			}
		}
	);
}

function update_language(email, language) {
	crmAPI.get('contact', { 'email': email },
        	function(contact_result) {
                	contact = contact_result.values[0];

			crmAPI.update('contact', { 'id': contact.id, 'preferred_language': language },
        			function(set_result) {
        			});
        	});
}

function new_member(args, res) {
	args.contact_type = 'Individual';
	args["api.EntityTag.create"] = '{"tag_id": 6}';

	crmAPI.create ('contact',args, function (result) {
		console.log(result);
		if (result.is_error == 0) {
			res.jsonp({"status":"success"});
		} else {
			res.status(403)
		}
	});
}

// more routes for our API will happen here
router.route('/admin/:auth_key/:action')
	.post (function(req, res) {
		switch (req.params.action) {
			case "newmember":
				console.log(req.params);
				console.log(req.body);
				console.log(map_new_member(req.body));
				//new_member(map_new_member(req.body), res);
				break;
			case "setnewsletter":
				var email = req.body.email;
				var language = req.body.language;
				var newsletters = [];
				var regions = [];

				if ('newsletter' in req.body) {
					for (i in req.body.newsletter) {
						newsletters.push(req.body.newsletter[i]);
					}
				}
			
				if ('region' in req.body) {
					for (i in req.body.region) {
						regions.push(req.body.region[i]);
					}
				}

				res.send("update complete");

				update_language(email, language);

				groups.update_newsletter(crmAPI, email, regions, newsletters);
				break;
			default:
				console.log("unknown admin command");
				break;
		}
		
        }
);

// more routes for our API will happen here
router.route('/member/:auth_key/:member_id')
	.get (function(req, res) {
		get_member_data(req.params.member_id, function(ret) {
			res.jsonp( ret );
		});
	}
);

// Invoice PDF API
router.route('/invoicepdf/:auth_key/:member_id/invoice.pdf')
	.get (function(req, res) {
		console.log('invoicepdf');
		fs.exists("/data/pdf/" + req.params.member_id + ".pdf", function(exists) {
			if (exists) {
				console.log("pdf exists");
				fs.readFile("/data/pdf/" + req.params.member_id + ".pdf", null, function (err,data) {
					if (err) {
						res.send(err);
					} else {
						res.send(data);
					}
				});
			} else {
				console.log("creating pdf");
				invoicer.create_pdf(req.params.member_id, function() {
					fs.readFile("/data/pdf/" + req.params.member_id + ".pdf", null, function (err,data) {
						if (err) {
							res.send(err);
						} else {
							res.send(data);
						}
					});
				});
			}
		});
	});

// Letterman API
router.route('/letterman/:auth_key/:member_id/:view')
	.get (function(req, res) {
		get_member_data(req.params.member_id, function(ret) {
			var dots_view = dots[req.params.view];
			if (req.query.format == "latex") {
				ret = recursive_lescape(ret);
			}
			if (dots_view) {
				var out = dots_view(ret);
				res.send(out);
			} else {
				res.send("Invalid view");
			}
		});
	});

// paylink
router.route('/paylink/:auth_key/:member_id')
	.get (function(req, res) {
		console.log(JSON.stringify(req.body));
		get_member_data(req.params.member_id, function(member) {
			var member_id = req.params.member_id;
			var amount = member.minimum_fee;
			var ret = {};
			ret.amount = amount;
			ret.first_name = member.first_name;
			ret.last_name = member.last_name;
			ret.member_id = member_id;
			ret.bitpay = {'enabled': 1};
			ret.stripe = {'enabled': 1};
			ret.bitpay.paylink = api_base + "/pay-bitpay/" + sha1(api_secret + ":pay-bitpay/" + member_id).substring(0,20) + "/" + member_id;
			ret.stripe.paylink = api_base + "/pay-stripe/" + sha1(api_secret + ":pay-stripe/" + member_id).substring(0,20) + "/" + member_id;
			res.jsonp( ret );
		});
	});

// paylink - bitpay
router.route('/pay-bitpay/:auth_key/:member_id')
	.get (function(req, res) {
		console.log(JSON.stringify(req.body));
		get_member_data(req.params.member_id, function(member) {
			var member_id = req.params.member_id;
			var amount = member.minimum_fee;
			var ret = {'status': 'failed', url: paylink_base + "/pay-fail"};
			// not used yet, need unique order_id first to prevent replays
			var posDataBody = JSON.stringify({member_id: member_id, order_id: -1});
			var posDataHash = sha1(paylink_secret + ":" + posDataBody);
			var data = {
			  price: amount,
			  currency: 'CHF',
			  notificationURL: api_base + '/bitpay/ipn',
			  posData: JSON.stringify({body: posDataBody, hash: posDataHash}),
		          buyer: {name: member_id},
			  redirectURL: paylink_base + "/pay-done",
			};
			console.log(JSON.stringify(data));
			var client = bitpay.createClient(bitpay_privkey, bitpay_config[bitpay_mode]);
			client.on('error', function(err) {
				console.log(err);
				//res.jsonp( ret );
				res.redirect (paylink_base + "/pay-fail");
			});

			client.on('ready', function() {
			  client.as('pos').post('invoices', data, function(err, invoice) {
				console.log(err || invoice);
				if (err)  {
			  		res.redirect (paylink_base + "/pay-fail");
				} else {
					ret.status = "success";
					ret.url = invoice.url;
					ret.invoice = invoice;
			  		res.redirect (invoice.url);
				}
				//res.jsonp( ret );
			  });
			});
		});
	});

// paylink - stripe
router.route('/pay-stripe/:auth_key/:member_id')
	.post (function(req, res) {
		console.log(JSON.stringify(req.body));
		get_member_data(req.params.member_id, function(member) {
			console.log(req.body);
			var stripe_token = req.body.stripeToken;
			var stripe_email = req.body.stripeEmail;
			var member_id = req.params.member_id;
			var amount = member.minimum_fee;
			var ret = {'status': 'failed'};

			// create charge using stripe module
			stripe.charges.create({
			  amount: amount * 100,
			  currency: "chf",
			  source: stripe_token,
			  description: "Mitgliederbeitrag 2020 " + member_id,
			  receipt_email: stripe_email,
			}).then(function(charge) {
			  console.log("Charge created");
			  console.log(charge);
			  res.redirect (paylink_base + "/pay-done");
			}, function(err) {
			  console.log(err);
			  res.redirect (paylink_base + "/pay-fail");
			});
		});
	});

// Bitpay IPN
router.route('/bitpay/ipn')
	.post (function(req, res) {
		// just log don't care
		console.log(JSON.stringify(req.body));
		res.send("OK"); // make bitpay happy for now
	});

// Stripe Charge
router.route('/stripe/charge')
	.post (function(req, res) {
		console.log(JSON.stringify(req.body));
	});

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api/v1', router);
app.use('/static', express.static('static'));

// ERROR HANDLER
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);
