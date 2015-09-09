var assert = require("assert")
  , sinon = require("sinon")
  , DNS = require('../src/dns')
  , _mdns = require('multicast-dns')
;

DNS.prototype.setMaxListeners(0);

var IPV4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
var IPV6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

describe( "DNS", function() {
  var dns
    , mdns
  ;

  beforeEach( function() {
    dns = new DNS( 'my-service', 6789 );
    mdns = _mdns();
  } );

  describe( "host lookup", function() {
    it( "provides the ipv4 over mDNS", function( done ) {
      dns.listen( function() {

        assert( !! dns.ipv4, "ipv4 is set" );
        assert( IPV4Regex.test( dns.ipv4 ) );

        mdns.once( 'response', function( response ) {
          assert.equal( response.answers.length, 1 );
          assert.deepEqual( response.answers[0], { type: 'A', name: 'my-service.local', ttl: 300, data: dns.ipv4, class: 1 } );
          done();
        } );

        mdns.query( 'my-service.local', 'A' );
      } );
    } );

    //it( "provides the ipv6 over mDNS", function( done ) {
      //dns.listen( function() {

        //assert( !! dns.ipv6, "ipv6 is set" );
        //assert( IPV6Regex.test( dns.ipv6 ) );

        //mdns.once( 'response', function( response ) {
          //assert.equal( response.answers.length, 1 );
          //assert.deepEqual( response.answers[0], { type: 'AAAA', name: 'my-service.local', ttl: 300, data: dns.ipv6, class: 1 } );
          //done();
        //} );

        //mdns.query( 'my-service.local', 'AAAA' );
      //} );
    //} );
  } );
} );
