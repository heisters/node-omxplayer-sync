var assert = require('assert')
  , Web = require('../src/web')
  , http = require('http')
;

describe( "Web", function() {
  var web
  ;

  beforeEach( function() {
    web = new Web( { serviceName: 'my-service', port: 6789 } );
  } );

  it( "makes a webpage available at the service address", function( done ) {
    this.timeout( 1e4 ); // not sure why so slow...
    web.listen( function() {
      http.get( { host: 'my-service.local', path: '/', port: 6789 }, function( response ) {
        assert.equal( response.statusCode, '200' );

        var body = blank = '';
        response.on('data', function(d) { body += d; });
        response.on('end', function() {
          assert.notEqual( body, blank );
          done();
        });
      } );
    } );
  } );
} );
