var mdns = require('multicast-dns')()
  , dns = require('dns')
  , os = require('os')
  , EventEmitter = require('events').EventEmitter
  , debug = require('debug')('dns')
;

function DNS( serviceName, httpPort ) {
  this.serviceName = serviceName;
  this.httpPort = httpPort;
}

DNS.prototype = new EventEmitter();

Object.defineProperties( DNS.prototype, {
  listen: { value: function( cb ) {
    this.lookupIP( function() { this.bindMDNS(); if ( cb ) cb(); }.bind( this ) );
  } },

  bindMDNS: { value: function() {
    mdns.on( "query", function( query ) {
      query.questions.forEach( this.answerQuestion.bind( this ) );
    }.bind( this ) );
  } },

  lookupIP: { value: function( cb ) {
    var waiting = 2;
    var hn = os.hostname();

    dns.lookup( hn, 4, function( err, address, family ) {
      if ( ! err ) this.ipv4 = address;
      if ( --waiting === 0 && cb ) cb( this );
    }.bind( this ) );

    dns.lookup( hn, 6, function( err, address, family ) {
      if ( ! err ) this.ipv6 = address;
      if ( --waiting === 0 && cb ) cb( this );
    }.bind( this ) );
  } },

  answerQuestion: { value: function( question ) {
    //console.log( question );
    var records = this.records();

    if ( question.type === 'PTR' && question.name === '_http._tcp.local' ) {
      var r = records.PTR.concat( records.SRV );
      debug( 'PTR response: %s', JSON.stringify( r ) );
      mdns.response( r );

    } else if ( question.type === 'SRV' && question.name === this.serviceName + '._http._tcp.local' ) {
      var r = records.SRV.concat( records.A );
      debug( 'SRV response: %s', JSON.stringify( r ) );
      mdns.response( r );

    } else if ( question.type === 'A' && question.name === this.serviceName + '.local' && this.ipv4 ) {
      var r =  records.A;
      debug( 'A response: %s', JSON.stringify( r ) );
      mdns.response( r );

    } else if ( question.type === 'AAAA' && question.name === this.serviceName + '.local' && this.ipv6 ) {
      var r =  records.AAAA;
      debug( 'AAAA response: %s', JSON.stringify( r ) );
      mdns.response( r );

    }
  } },

  records: { value: function() {
    return {
      A: [{
        type: 'A',
        name: this.serviceName + '.local',
        ttl: 300,
        data: this.ipv4
      }],

      AAAA: [{
        type: 'AAAA',
        name: this.serviceName + '.local',
        ttl: 300,
        data: this.ipv6
      }],

      SRV: [{
        type: 'SRV',
        name: this.serviceName + '._http._tcp.local',
        data: {
          port: this.httpPort,
          weight: 0,
          priority: 0,
          target: this.serviceName + '.local'
        }
      }],

      PTR: [{
        type: 'TXT',
        name: '_http._tcp.local',
        data: ''
      }, {
        type: 'PTR',
        name: '_http._tcp.local',
        data: '_http._tcp.local'
      }, {
        type: 'PTR',
        name: '_http._tcp.local',
        data: this.serviceName + '._http._tcp.local'
      }]
    };
  } }
} );

module.exports = DNS;
