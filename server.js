// server.js

// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var assert     = require('assert');
var crypto = require('crypto');

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

function sha1(value) {
	var shasum = crypto.createHash('sha1');

	shasum.update(value);
	return shasum.digest('hex');
}


// Fetch Membership fees and cache them
var membership_types = {};
crmAPI.get ('MembershipType',{is_active: 1, return:'name,minimum_fee'},
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

// more routes for our API will happen here
router.route('/member/:auth_key/:member_id')
	.get (function(req, res) {
		crmAPI.get ('contact',{contact_type:'Individual', external_identifier: req.params.member_id, return:'preferred_communication_method,email_greeting_display,postal_greeting_display,display_name,first_name,last_name,email,phone,street_address,postal_code,city,country'},
			function (result) {
				var ret={};
				if (result.values && result.values.length==1) {
					var contact = result.values[0];
					ret.contact = contact;
					console.log(contact.id +": "+contact.display_name+ " "+contact.email+ " "+ contact.phone);
					crmAPI.get ('membership',{contact_id: contact.contact_id},
						function (result) {
							for (var i in result.values) {
								var val = result.values[i];

								// add info from membership_types e.g. price
								val.minimum_fee = membership_types[val.membership_name].minimum_fee;

								// TODO, this is a hackish selection of section levels (PPS, PPXX and PPCITYNAME)
								if(val.membership_name.length == 3)
									ret.level1 = val
								else if(val.membership_name.length == 4)
									ret.level2 = val
								else
									ret.level3 = val
							}
							ret.minimum_fee = parseInt(ret.level1.minimum_fee) + parseInt(ret.level2.minimum_fee) + parseInt(ret.level3.minimum_fee);
							res.json( ret );   
						}
					);
				} else {
					res.json( {} );   
				}
			}
		);
	}
);

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

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);

