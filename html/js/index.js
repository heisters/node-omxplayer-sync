var $ = require('jquery')
  , socket = require('socket.io-client')()
  , css = require('../css/index.css')
;

socket.on( 'status', function ( nodes ) {
  $( "body" ).empty();
  for ( var nid in nodes ) {
    if ( ! nodes.hasOwnProperty( nid ) ) continue;

    var status = nodes[ nid ];
    $( "<pre>" ).text( JSON.stringify( status ) ).appendTo( $( "body" ) );
  }
} );
