var bitpay     = require('bitpay');

var privkey    = process.env.BITPAY_PRIVKEY;
var client     = bitpay.createClient(privkey);

var data = {
  price: 1,
  currency: 'CHF',
  notificationURL: process.env.BITPAY_IPN,
};

client.on('error', function(err) {
    console.log(err);
});

client.on('ready', function() {
  client.as('merchant').post('invoices', data, function(err, invoice) {
    console.log(err || invoice);
  });

});
