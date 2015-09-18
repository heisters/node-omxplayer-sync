var $ = require('jquery')
  , socket = require('socket.io-client')()
  , css = require('../css/index.css')
  , HUSL = require('husl')
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
      deltaData[ i ].push( nstatus.delta === undefined ? 0 : nstatus.delta );
    }

    updateDeltas( deltaData, ordered );
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

function updateDeltas( data, orderedStatuses ) {
  var $deltas = $("#deltas")
    , ctx = $deltas[0].getContext( '2d' )
    , w = $deltas.width()
    , h = $deltas.height()
    , margin = 20
  ;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.font = "12px Roboto";

  for ( var i in data ) while( data[ i ].length > w ) data[ i ].shift();

  var sum = 0, count = 0, sqrDiffSum = 0;
  for ( var i in data ) {
    for ( var j in data[ i ] ) {
      var delta = data[ i ][ j ];
      if ( delta === undefined ) continue;

      sum += delta;
      count++;
    }
  }
  var avg = sum / count;

  for ( var i in data ) {
    for ( var j in data[ i ] ) {
      var delta = data[ i ][ j ];
      if ( delta === undefined ) continue;

      var diff = delta - avg;
      sqrDiffSum += diff * diff;
    }
  }
  var avgSqrDiff = sqrDiffSum / count;
  var stdDev = Math.sqrt( avgSqrDiff );
  var range = stdDev * 1.5;


  ctx.clearRect( 0, 0, w, h );

  ctx.strokeStyle = "#CCCCCC";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo( 0, margin );
  ctx.lineTo( w, margin );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo( 0, h - margin );
  ctx.lineTo( w, h - margin );
  ctx.stroke();

  ctx.fillStyle = "#333";
  ctx.textBaseline = "bottom";
  ctx.fillText( range.toFixed( 5 ) + " secs", 0 , margin );
  ctx.textBaseline = "hanging";
  ctx.fillText( (-range).toFixed( 5 ) + " secs", 0 , h - margin + 3 );

  var labelsX = w;
  for ( var i in data ) {
    var rgb = HUSL.toRGB( 360 / data.length * i, 100, 50 )
      , a = 0.5
      , fillStyle = "rgba(" + rgb.map( function(x) { return (Math.max( x, 0 ) * 255).toFixed( 0 ); } ).concat( a ).join( ',' ) + ")"

    ctx.fillStyle = fillStyle

    var name = orderedStatuses[ i ].hostname, strw = ctx.measureText( name ).width;
    labelsX -= strw + (i === "0" ? 0 : 10);
    ctx.textBaseline = "bottom";
    ctx.fillText( name, labelsX, margin );


    for ( var j in data[ i ] ) {
      var delta = data[ i ][ j ];
      if ( delta === undefined ) continue;

      var x = j
        , yScale = 0.5 * ( h - margin * 2 )
        , y = Math.floor( delta / range * yScale + ( yScale + margin ) )
      ;

      ctx.fillRect( x, y, 1, 1 );
    }
  }
}
