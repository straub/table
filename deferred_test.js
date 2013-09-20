#!/bin/env node

//var deferred = require('deferred');
var /*Q = require('q'),*/
    _ = require('underscore'),
    when = require('when');

var deferred = when.defer;

console.log("begin");

/*deferred.monitor(5000, function(err){
    console.error(err);
});*/

var players = [
        "scinvention",
        "jonathanstraub",
        "jamesstraub"
    ];

function getFromDb(thing){
    var def = when.defer();
    setTimeout(function(){
        def.resolve(thing);
    }, 500);
    return def.promise;
}

getFromDb("player").then(function(thing){
    console.log(thing);
});

/*deferred.map(players, function(player){
    return getFromDb(player+":deferred");
}).then(function(players){
    console.log(players);
});*/

function getPlayersFromDb(players){
    var def = when.defer();

    var playersPromise = when.map(players, function(player){
        return getFromDb(player+":deferred");
    });

    //def.resolve(playersPromise);

    //when.chain(playersPromise, def);

    def.reject(new Error("rejected"));

    //setTimeout(function(){ def.resolve(new Error("rejected")); }, 100);

    return def.promise;
}

getPlayersFromDb(players).then(function(players){
    console.log(players);
},
function(err){
    console.error("caught error:", err);
});

console.log("end");