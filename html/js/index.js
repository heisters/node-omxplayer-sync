var $ = require('jquery')
  , socket = require('socket.io-client')()
;


socket.on( 'status', function ( status ) {
  $( 'body' ).append( "<pre>" ).text( JSON.stringify( status ) );
} );
