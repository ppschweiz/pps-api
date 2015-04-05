// update-member.js
// synchronize LDAP MDB to CiviCRM
// by philipp@hug.cx

// call the packages we need
var assert = require('assert');
var merge = require('object-mapper').merge;
var ldap = require('ldapjs');
var phone = require('node-phonenumber');
var phoneUtil = phone.PhoneNumberUtil.getInstance();
var clone = require('clone');

// CiviCRM
var config = {
  server: process.env.CIVICRM_SERVER,
  path: process.env.CIVICRM_PATH,
  key: process.env.CIVICRM_SITE_KEY,
  api_key: process.env.CIVICRM_API_KEY,
};

var crmAPI = require('civicrm')(config);

var ldap_opts = {
  binddn: process.env.LDAP_BINDDN,
  bindpw: process.env.LDAP_BINDPW,
  basedn: process.env.LDAP_BASEDN,
  filter: process.env.LDAP_FILTER,
  url: 'ldap://' + process.env.LDAP_PORT_389_TCP_ADDR + ':' + process.env.LDAP_PORT_389_TCP_PORT,
};

function prettyPhone(value) {
	if (value) try {
		var phoneNumber = phoneUtil.parse(value, 'CH');
		if (phoneUtil.isValidNumber(phoneNumber))
			return phoneUtil.format(phoneNumber, phone.PhoneNumberFormat.INTERNATIONAL);
	} catch(err) {
		// return undefined
	}
	return undefined;
}

// TODO, add en_CH, fr_CH, it_CH
map_preferred_language = {'de': 'de_CH', 'fr': 'fr_FR', 'en': 'en_GB', 'it': 'it_IT'}
map_preferred_communication_method = {'0': '1', '1': '2'}
map_gender = {'0':'', '1': '2', '2': '1', '3': ''}
map_gender_prefix = {'0':'', '1': '3', '2': '1', '3': ''} // CiviCRM: 1= Mrs, 2=Ms, 3=Mr, 4=Dr

fieldmap_contact_org = { 
	'organization_name':'displayName',
	'display_name':'displayName',
	'state_province':'st',
	'email':'mail'
};

fieldmap_contact_person = {
	'uniqueIdentifier': 'external_identifier',
	'cn': {
		key: 'display_name',
		default: function(objFrom, objTo) {
			return "user"+objFrom.uniqueIdentifier;
		},
	},
	'uid': 'nick_name', 
	'preferredLanguage': { 
		key: 'preferred_language', 
		transform: function(value, objFrom, objTo) {
			return map_preferred_language[value];
		}, 
		default: function(objFrom, objTo) {
			return "de_CH";
		},
	},
	'ppsPreferredNotificationMethod': {
		key: 'preferred_communication_method',
		transform: function(value, objFrom, objTo) {
                        return map_preferred_communication_method[value];
                },
		default: function(objFrom, objTo) {
			return "1";
		},
	},
	'ppsGender': [{
			key: 'gender_id',
			transform: function(value, objFrom, objTo) {
				return map_gender[value];
			},
			default: function(objFrom, objTo) {
				return undefined;
			},
		},{
			key: 'prefix_id',
			transform: function(value, objFrom, objTo) {
				return map_gender_prefix[value];
			},
			default: function(objFrom, objTo) {
				return undefined;
			},
		}
	],
	'sn': {
		key: 'last_name',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'givenName': {
		key: 'first_name',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'ppsBirthDate': {
		key: 'birth_date',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
};

fieldmap_address_person = {
	'postalCode': {
		key: 'postal_code',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'c': {
		key: 'country',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'l': {
		key: 'city',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'st': {
		key: 'state_province',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'street': {
		key: 'street_address',
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
};

fieldmap_phone_main_person = {
	'telephoneNumber': {
		key: 'phone',
		transform: function(value, objFrom, objTo) {
			return prettyPhone(value);
		},
	},
};

fieldmap_phone_mobile_person = {
	'mobile': {
		key: 'phone',
		transform: function(value, objFrom, objTo) {
			return prettyPhone(value);
		},
	},
}

fieldmap_email_person = {
	'mail': {
		key: 'email',
		transform: function(value, objFrom, objTo) {
			if (value && value.constructor == Array)
				return value[0]
			else
				return value;
		},
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
}

fieldmap_email_alternate_person = {
	'ppsAlternateMail': {
		key: 'email',
		transform: function(value, objFrom, objTo) {
			if (value && value.constructor == Array)
				return value[0]
			else
				return value;
		},
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
}

fieldmap_membership_person = {
	'ppsJoining': {
		key: 'join_date',
		transform: function(value, objFrom, objTo) {
			if (value && value.constructor == Array)
				return value[0].substring(0,8)
			else if (value)
				return value.substring(0,8)
			else
				return undefined;
		},
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'ppsLeaving': {
		key: 'end_date',
		transform: function(value, objFrom, objTo) {
			if (value && value.constructor == Array)
				return value[0].substring(0,8)
			else if (value)
				return value.substring(0,8)
			else
				return undefined;
		},
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
	'employeeType': {
		key: 'status_id',
		transform: function(value, objFrom, objTo) {
			if (value == 8) {// WalkedThePlank=8, expelled, 
				objTo.is_override = 1;
				return "Expelled"; // CiviCRM custom - expelled
			} else if (value == 3) {// Veteran=3, no longer member
				//objTo.is_override = 1;
				return "Cancelled"; // CiviCRM - Cancelled
			} else
				return undefined; // let CiviCRM do its magic
		},
		default: function(objFrom, objTo) {
			return undefined;
		},
	},
};

fieldmap_membership_level1_person =  clone(fieldmap_membership_person);
fieldmap_membership_level1_person.dn = {
		key: 'membership_type',
		transform: function(value, objFrom, objTo) {
			return undefined;
		},
		default: function(objFrom, objTo) {
			return "PPS";
		},
};

fieldmap_membership_level2_person =  clone(fieldmap_membership_person);
fieldmap_membership_level2_person.dn = {
		key: 'membership_type',
		transform: function(value, objFrom, objTo) {
			if (value) {
				var split = value.split(',');
				var section = '';
				for (n in split) {
					var s = split[n];
					if (s.indexOf('st=')==0)
						section = s.substring(3);
				}
				if (section)
					section = 'PP' + section.toUpperCase();
	
				return section;
			}
		},
		default: function(objFrom, objTo) {
			return undefined;
		},
	};


fieldmap_membership_level3_person =  clone(fieldmap_membership_person);
fieldmap_membership_level3_person.dn = {
		key: 'membership_type',
		transform: function(value, objFrom, objTo) {
			if (value) {
				var split = value.split(',');
				var section = '';
				for (n in split) {
					var s = split[n];
					if (s.indexOf('l=')==0)
						section = s.substring(2);
				}
				if (section)
					section = 'PP' + section.toUpperCase();

				return section;
			}
		},
		default: function(objFrom, objTo) {
			return undefined;
		},
	};
fieldmaps = {
	'Address': [fieldmap_address_person],
	'Contact': [fieldmap_contact_person],
	'Phone': [null, fieldmap_phone_main_person, fieldmap_phone_mobile_person],
	'Email': [null, fieldmap_email_person,  null, null, fieldmap_email_alternate_person],
	'Membership': [fieldmap_membership_level1_person, fieldmap_membership_level2_person, fieldmap_membership_level3_person],
};


function mergeArray(array1,array2) {
  for(item in array1) {
    array2[item] = array1[item];
  }
  return array2;
}

function _crud(object, where, value, values, callback) {
	values = mergeArray(where, values);
	// where = merge(values, {}, wheremaps[object]);
	//console.log('crud: ' + object + "," + JSON.stringify(where) + "," + value + "," + JSON.stringify(values));
	crmAPI.get (object,where,
		function (result) {
  			assert.equal(result.is_error, 0, "CRUD failed for " + object + " " + JSON.stringify(values) + " result:" + JSON.stringify(result));
			values.id = result.id;
			//console.log('_crud found: ' + object + " " + JSON.stringify(result));
			if (value) { // update or create
				//console.log('_crud creating: ' + object + " " + values + " " + JSON.stringify(values));
				crmAPI.create(object, values,
					function(result) {
  						assert.equal(result.is_error, 0, "CRUD failed for " + object + " " + JSON.stringify(values) + " result:" + JSON.stringify(result));
						//console.log('_crud created: ' + object + " " + JSON.stringify(result));
						if (callback)
							callback(result.id);
					});
			} else if (result.id) {
				crmAPI.delete(object, {'id': result.id},
					function(result) {
  						assert.equal(result.is_error, 0, "CRUD failed for " + object + " " + JSON.stringify(values) + " result:" + JSON.stringify(result));
						//console.log('_crud deleted: ' + object + " " + JSON.stringify(result));
					});
				if (callback)
					callback(result.id);
			}
		}
	);
}


function map_to_object(object, entry, variant) {
	return merge(entry, {}, fieldmaps[object][variant]);
}

function add_or_update_object(object, entry) {
        var externalid = entry.uniqueIdentifier;
	//console.log('entry: ' + JSON.stringify(entry));

	console.log("externalid: " + externalid);
        var contact = map_to_object('Contact', entry, 0);

	// more crunshing
        contact.contact_type = 'Individual';

        contact_id = _crud('Contact', {'external_identifier': externalid}, contact.display_name, contact, function(contact_id) {

		console.log("update:"+contact_id);
		//console.log(contact);
		// HOME
		var email_main = map_to_object('Email', entry, 1);
		_crud('Email', {'contact_id':contact_id, 'location_type_id':1}, email_main.email, email_main);

		// OTHER
		var email_other = map_to_object('Email', entry, 4);
		_crud('Email', {'contact_id':contact_id, 'location_type_id':4}, email_other.email, email_other);

		var address = map_to_object('Address', entry, 0);
		address.is_billing = 1
		address.is_primary = 1
		_crud('Address', {'contact_id':contact_id, 'location_type_id':1}, address.city, address);

		// main phone_type_id=1
		var main_phone = map_to_object('Phone', entry, 1);
		_crud('Phone', {'contact_id':contact_id, 'location_type_id': 3, 'phone_type_id':'1'}, main_phone.phone, main_phone);

		// mobile phone_type_id=2
		var mobile_phone = map_to_object('Phone', entry, 2);
		_crud('Phone', {'contact_id':contact_id, 'location_type_id': 3, 'phone_type_id':'2'}, mobile_phone.phone, mobile_phone);

		// Add membership definition // PPS
		var membership = map_to_object('Membership', entry, 0);
		_crud('Membership', {'contact_id':contact_id, membership_type: membership.membership_type}, membership.membership_type && entry.ppsJoining, membership);

		// Add membership definition // cantonal section
		var membership = map_to_object('Membership', entry, 1);
		_crud('Membership', {'contact_id':contact_id, membership_type: membership.membership_type}, membership.membership_type && entry.ppsJoining, membership);

		// Add membership definition // bezirk section
		var membership = map_to_object('Membership', entry, 2);
		_crud('Membership', {'contact_id':contact_id, membership_type: membership.membership_type}, membership.membership_type && entry.ppsJoining, membership);
	});
}


// LDAP
var client = ldap.createClient({
  url: ldap_opts.url,
  bindDN: ldap_opts.binddn,
  bindCredentials: ldap_opts.bindpw,
  maxConnections: 5,
});

client.bind(ldap_opts.binddn, ldap_opts.bindpw, function(err) {
	assert.ifError(err);

	var opts = {
	  filter: ldap_opts.filter,
	  scope: 'sub'
	};

	client.search(ldap_opts.basedn, opts, function(err, res) {
	  assert.ifError(err);

	  res.on('searchEntry', function(entry) {
		add_or_update_object('Contact', entry.object);
		
	  });
	  res.on('searchReference', function(referral) {
	  	console.log('referral: ' + referral.uris.join());
	  });
	  res.on('error', function(err) {
	  	assert.ifError(err);
	  });
	  res.on('end', function(result) {
	  	console.log('status: ' + result.status);
		client.unbind();
	  });
	});
});

