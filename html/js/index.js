var $ = require('jquery')
  , socket = require('socket.io-client')()
  , css = require('../css/index.css')
;

// Simple JavaScript Templating
// John Resig - http://ejohn.org/ - MIT Licensed
var T = (function(){
  var cache = {};

  return function tmpl(str, data){
    // Figure out if we're getting a template, or if we need to
    // load the template - and be sure to cache the result.
    var fn = !/\W-/.test(str) ?
      cache[str] = cache[str] ||
        tmpl(document.getElementById(str).innerHTML) :

      // Generate a reusable function that will serve as a template
      // generator (and which will be cached).
      new Function("obj",
        "var p=[],print=function(){p.push.apply(p,arguments);};" +

        // Introduce the data as local variables using with(){}
        "with(obj){p.push('" +

        // Convert the template into pure JavaScript
        str
          .replace(/[\r\t\n]/g, " ")
          .split("<%").join("\t")
          .replace(/((^|%>)[^\t]*)'/g, "$1\r")
          .replace(/\t=(.*?)%>/g, "',$1,'")
          .split("\t").join("');")
          .split("%>").join("p.push('")
          .split("\r").join("\\'")
      + "');}return p.join('');");

    // Provide some basic currying to the user
    return data ? fn( data ) : fn;
  };
})();

$( onDOMReady );


function onDOMReady() {
  var templates = {
    status: T("status-template")
  };
  var deltaData = [];

  socket.on( 'status', function ( status ) {
    var $container = $( "#statuses" ).empty();

    var ordered = [];
    for ( var nid in status.nodes ) {
      if ( ! status.nodes.hasOwnProperty( nid ) ) continue;
      ordered.push( status.nodes[ nid ] );
    }
    ordered.sort( function( a, b ) { return a.hostname.localeCompare( b.hostname ); } );

    for ( var i in ordered ) {
      var nstatus = ordered[ i ];
      $( templates.status( {
        status: nstatus
        , time: status.time
        , nodeUrl: function( host ) {
            return window.location.href.replace( new RegExp( window.location.hostname, 'g' ), host );
          }
      } ) ).appendTo( $container );

      deltaData[ i ] = deltaData[ i ] || [];
      deltaData[ i ].push( nstatus.delta );
    }

    updateDeltas( deltaData );
  } );

  $( 'body' ).on( "click", "button.command", function() {
    $this = $( this );
    var command = $this.data( "command" );
    var message = "Are you sure you want to " + command + " all players?";
    if ( $this.is( ".dangerous" ) ) message += " This may require manual intervention to get all players running again.";
    if ( confirm( message ) ) {
      socket.emit( "command", { command: command } );
    }
  } );
}

function updateDeltas( data ) {
  var $deltas = $("#deltas")
    , ctx = $deltas[0].getContext( '2d' )
    , w = $deltas.width()
    , h = $deltas.height()
    , px = ctx.createImageData( 1, 1 )
    , pxData = px.data
  ;

  for ( var i in data ) while( data[ i ].length > w ) data[ i ].shift();

  ctx.clearRect( 0, 0, w, h );
  for ( var i in data ) {
    var d = data[ i ];
    for ( var j in d ) {
      var delta = d[ j ];

      var x = w - j
        , y = Math.floor( delta * h * 0.5 + h * 0.5 )
        , r = 0 * 255
        , g = 0 * 255
        , b = 0 * 255
        , a = 0.5
      ;

      pxData[0] = r;
      pxData[1] = g;
      pxData[2] = b;
      pxData[3] = a;
      ctx.putImageData( px, x, y );
    }
  }
}
