// server.js

// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var assert     = require('assert');
var crypto = require('crypto');
var dots = require("dot").process({path: "./views", templateSettings: {strip: false}});
var lescape = require('escape-latex');

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 80;        // set our port

// CiviCRM
var config = {
  server: process.env.CIVICRM_SERVER,
  path: process.env.CIVICRM_PATH,
  key: process.env.CIVICRM_SITE_KEY,
  api_key: process.env.CIVICRM_API_KEY,
};

var crmAPI = require('civicrm')(config);


// secrets to protect API
var secrets = process.env.PPSAPI_SECRETS.split(',');
// to access the API, the following hash needs to be generated
// sha1(secret + ":" + f1 + "/" + leftover).substring(0,20)
// e.g. http://localhost:8080/members/hash/blabla would result in
// sha1(secret:members/blabla).substring(0,20) only half of the hash is used

var paylink_base =  process.env.PPSAPI_BASEURL || "https://api.test.piratenpartei.ch/";
var paylink_secret = process.env.PPSAPI_PAYSECRET;

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
						for (var i in result.values) {
							var val = result.values[i];

							// add info from membership_types e.g. price and section name
							val.minimum_fee = membership_types[val.membership_name].minimum_fee;
							val.description = membership_types[val.membership_name].description;

							total_fee = total_fee + parseInt(val.minimum_fee);

							// TODO, this is a hackish selection of section levels (PPS, PPXX and PPCITYNAME)
							if(val.membership_name.length == 3)
								ret.level1 = val
							else if(val.membership_name.length == 4)
								ret.level2 = val
							else
								ret.level3 = val
						}
						ret.minimum_fee = total_fee.toFixed(2);
						// construct invoice number and ESR
						ret.invoicenr = "14" + pad(ret.external_identifier, 6, 0);
						ret.esrreference = ret.invoicenr;
						ret.esrprefix = "01" + "00000" + pad(ret.external_identifier, 5, 0) + "20150";
						ret.paylink = paylink_base + "pay/" + sha1(paylink_secret + ":pay/" + ret.external_identifier).substring(0,20) + "/" + ret.external_identifier;
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

// more routes for our API will happen here
router.route('/member/:auth_key/:member_id')
	.get (function(req, res) {
		get_member_data(req.params.member_id, function(ret) {
			res.json( ret );
		});
	}
);

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

// Bitpay IPN
router.route('/bitpay/ipn')
	.post (function(req, res) {
		console.log(JSON.stringify(req.values));
	});

// Stripe Charge
router.route('/strip/charge')
	.post (function(req, res) {
		console.log(JSON.stringify(req.values));
	});

// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api/v1', router);
app.use('/static', express.static('static'));

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);
