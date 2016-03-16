// call the packages we need
var assert     = require('assert');
var crypto = require('crypto');
var request = require('request');
var async   = require('async');
var fs      = require('fs');

function contains(list, item) {
        for (var i in list) {
                if (list[i] == item)
                        return true;
        }

        return false;
}


const GROUP_PPS_SYMPATHIZERS_ID = "33";
const GROUP_PPBB_SYMPATHIZERS_ID = "34";
const GROUP_PPBE_SYMPATHIZERS_ID = "35";
const GROUP_PPZH_SYMPATHIZERS_ID = "36";
const GROUP_PPZS_SYMPATHIZERS_ID = "37";
const GROUP_PPOS_SYMPATHIZERS_ID = "38";
const GROUP_PPVS_SYMPATHIZERS_ID = "39";
const GROUP_PPFR_SYMPATHIZERS_ID = "40";
const GROUP_PPNE_SYMPATHIZERS_ID = "41";
const GROUP_PPGE_SYMPATHIZERS_ID = "42";
const GROUP_PPVD_SYMPATHIZERS_ID = "43";
const GROUP_PPZUERICH_SYMPATHIZERS_ID = "44";
const GROUP_PPWINTERTHUR_SYMPATHIZERS_ID = "45";
const GROUP_PPBERN_SYMPATHIZERS_ID = "46";
const GROUP_PPTI_SYMPATHIZERS_ID = "48";
const GROUP_NO_NEWSLETTER_POLITICS_ID = "71";
const GROUP_NO_NEWSLETTER_EVENTS_ID = "72";
const GROUP_NO_NEWSLETTER_ACTIONS_ID = "73";
const GROUP_NO_NEWSLETTER_PARTICIPATION_ID = "74";

var sympathizer_groups = [
	GROUP_PPS_SYMPATHIZERS_ID,
	GROUP_PPBB_SYMPATHIZERS_ID,
	GROUP_PPBE_SYMPATHIZERS_ID,
	GROUP_PPZH_SYMPATHIZERS_ID,
	GROUP_PPZS_SYMPATHIZERS_ID,
	GROUP_PPOS_SYMPATHIZERS_ID,
	GROUP_PPVS_SYMPATHIZERS_ID,
	GROUP_PPFR_SYMPATHIZERS_ID,
	GROUP_PPNE_SYMPATHIZERS_ID,
	GROUP_PPGE_SYMPATHIZERS_ID,
	GROUP_PPVD_SYMPATHIZERS_ID,
	GROUP_PPZUERICH_SYMPATHIZERS_ID,
	GROUP_PPWINTERTHUR_SYMPATHIZERS_ID,
	GROUP_PPBERN_SYMPATHIZERS_ID,
	GROUP_PPTI_SYMPATHIZERS_ID,
];

var no_newsletter_groups = [
	GROUP_NO_NEWSLETTER_POLITICS_ID,
	GROUP_NO_NEWSLETTER_EVENTS_ID,
	GROUP_NO_NEWSLETTER_ACTIONS_ID
];

function is_relevant_group(group_id) {
	return contains(no_newsletter_groups, group_id) || contains(sympathizer_groups, group_id);
}

function update_groups(crmAPI, contact, groups) {
	crmAPI.get('group_contact', { 'contact_id': contact.id },
		function(group_result) {

			var current = [];

			for (var i in group_result.values) {
				var group_id = group_result.values[i].group_id;
				current.push(group_id);

				if (is_relevant_group(group_id) && !contains(groups, group_id)) {
					crmAPI.delete('group_contact', { 'contact_id': contact.id, 'group_id': group_id },
						function(delete_result) {
						});
				}
			}

			for (var i in groups) {
				var group_id = groups[i];
						
				if (is_relevant_group(group_id) && !contains(current, group_id)) {
					crmAPI.create('group_contact', { 'contact_id': contact.id, 'group_id': group_id, 'status': 'Added' },
						function(create_result) {
						});
				}
			}
					
		});
}

function update_groups_or_create(crmAPI, email, groups) {
	crmAPI.get('Contact', { 'email': email },
		function(contact_result) {
			if (contact_result.values.length >= 1) {
				contact = contact_result.values[0];
				update_groups(crmAPI, contact, groups);
			} else {
				crmAPI.create('contact', { 'email': 'hostmaster@savvy.ch', 'contact_type': 'Individual' },
				        function(create_result) {
						contact = create_result.values[0];
						update_groups(crmAPI, contact, groups);
        				});
			}
		});
}

function update_newsletter(crmAPI, email, regions, newsletters)
{
	var groups = [];

        for (var i in regions) {
		if (is_relevant_group(regions[i])) { 
			groups.push(regions[i]);
		}
	}
        
	for (var i in no_newsletter_groups) {
		if (!contains(newsletters, no_newsletter_groups[i])) {
			groups.push(no_newsletter_groups[i]);
		}
	}

	update_groups_or_create(crmAPI, email, groups);
}

module.exports = {
	GROUP_PPS_SYMPATHIZERS_ID,
	GROUP_PPBB_SYMPATHIZERS_ID,
	GROUP_PPBE_SYMPATHIZERS_ID,
	GROUP_PPZH_SYMPATHIZERS_ID,
	GROUP_PPZS_SYMPATHIZERS_ID,
	GROUP_PPOS_SYMPATHIZERS_ID,
	GROUP_PPVS_SYMPATHIZERS_ID,
	GROUP_PPFR_SYMPATHIZERS_ID,
	GROUP_PPNE_SYMPATHIZERS_ID,
	GROUP_PPGE_SYMPATHIZERS_ID,
	GROUP_PPVD_SYMPATHIZERS_ID,
	GROUP_PPZUERICH_SYMPATHIZERS_ID,
	GROUP_PPWINTERTHUR_SYMPATHIZERS_ID,
	GROUP_PPBERN_SYMPATHIZERS_ID,
	GROUP_PPTI_SYMPATHIZERS_ID,
	update_newsletter
}

