FROM node:0.12-onbuild

# Overwrite these with actual passwords,keys and URLs
ENV PPSAPI_SECRETS abcdef,ghijkl
ENV PPSAPI_BASEURL https://api.test.piratenpartei.ch/
ENV PPSAPI_PAYSECRET abcdef

ENV BITPAY_IPN_URL https://pps-api.test.piratenpartei.ch/bitpay/ipn
ENV BITPAY_SECRET_KEY secret

ENV CIVICRM_SERVER http://wordpress.local.piratenpartei.ch
ENV CIVICRM_PATH /wp-content/plugins/civicrm/civicrm/extern/rest.php/extern/rest.php
ENV CIVICRM_SITE_KEY secret
ENV CIVICRM_API_KEY secret

ENV LDAP_BINDDN cn=admin,dc=piratenpartei,dc=ch
ENV LDAP_BINDPW root
ENV LDAP_BASEDN dc=piratenpartei,dc=ch
ENV LDAP_FILTER (uniqueIdentifier=*)
#ENV LDAP_PORT_389_TCP_ADDR ldap
#ENV LDAP_PORT_389_TCP_PORT 389

