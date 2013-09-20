(function(){

  var object = {};
  _.extend(object, Backbone.Events);
  var fn = function(){};

  JSLitmus.test('Events: bind + unbind', function() {
    object.on("event", fn);
    object.off("event", fn);
  });

})();
