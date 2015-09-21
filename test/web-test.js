var assert = require('assert')
  , Web = require('../src/web')
  , http = require('http')
;

describe( "Web", function() {
  var web
    , host
    , getit = function( cb ) {
      return http.get( { host: host+'.local', path: '/', port: 6789 }, cb );
    }
  ;

  beforeEach( function() {
    host = 'my-service-' + Math.floor( Math.random() * 1e10 ) // avoid caching
    web = new Web( { serviceName: host, port: 6789 } );
  } );

  afterEach( function() {
    web.close();
  } );

  it( "makes a webpage available at the service address after it becomes master", function( done ) {
    this.timeout( 1e4 ); // not sure why so slow...
    web.listen( function() {
      web.master( function() {
        getit( function( response ) {
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

  it( "does not make a webpage available at the service address if it does not become master", function( done ) {
    this.timeout( 1e4 ); // takes about 5 seconds for the lookup to fail
    web.listen( function() {
      getit( function() {
        throw new Error( "should not succeed" );
      } ).on( "error", function( error ) {
        assert.equal( error.code, "ENOTFOUND" );
        done();
      } );
    } );
  } );
} );
