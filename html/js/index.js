var $ = require('jquery')
  , socket = require('socket.io-client')()
;


socket.on( 'status', function ( status ) {
  $( "<pre>" ).text( JSON.stringify( status ) ).appendTo( $( "body" ) );
} );
