pps-api package
===============

Contains various tools and apis for membership data.

APIs
----

1. /member/:auth_key/:member_id
Fetch information about member and payment status

2. /letterman/:auth_key/:member_id/:variant
Returns TeX or mail bodies

3. /bitpay/ipn
Mark payment as paid

4. /stripe/charge
Charge credit card and mark as paid
