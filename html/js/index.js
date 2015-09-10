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
    }
  } );
}
