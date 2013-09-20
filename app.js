#!/bin/env node

/**
 * Module dependencies.
 */

var version = require("./package.json").version,
    http = require('http'),
    express = require('express'),
    routes = require('./routes'),
    winston = require('winston'),
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    MongooseArray = mongoose.Types.Array,
    async = require("async"),
    _ = require("underscore"),
    when = require('when'),

    app = module.exports = express(),

    server = http.createServer(app),

    io = require('socket.io'),

    db = mongoose.createConnection('localhost', 'table');

// Allow 25 simultaneous connections on the same socket.
// This applies to outbound requests only.
http.globalAgent.maxSockets = 25;

// Setup logging
// Add "warn" for socket.io compatibility.
var levels = _.extend({}, winston.config.syslog.levels, { warn: 3 }),
    logger = new (winston.Logger)({
    levels: levels,
    exceptionHandlers: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'exceptions.log', timestamp: "true" })
    ],
    exitOnError: true
});

// Handle logger errors.
logger.on('error', function (err) { console.log(err); });

// Configuration

app.configure(function(){
    app.set('port', process.env.PORT || 8082);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express["static"](__dirname + '/public'));
    
    // Configure logging transports.
    logger.add(winston.transports.Console, { level: "debug" })
          .add(winston.transports.File, { filename: "app.log", timestamp: "true", level: "debug" });
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
});

app.on('error', function (err) {
    logger.error(err);
});

// Models / Schemas

var ProfileSchema = Schema({
    first_name: String,
    username: {
        type: String,
        required: true,
        unique: true
    },
    games: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'Game'
        }]
    }
});

var Profile = db.model('Profile', ProfileSchema);

var CardSchema = Schema({
    suit: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true
    },
    face: Boolean,
    position: {
        x: {
            type: Number
        },
        y: {
            type: Number
        }
    },
    _player: {
        type: Schema.Types.ObjectId,
        ref: 'Profile'
    },
    _game: {
        type: Schema.Types.ObjectId,
        ref: 'Game'
    }
});

var Card = db.model('Card', CardSchema);

/*var DeckSchema = Schema({
    cards: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'Card'
        }],
        required: true
    },
    _game: {
        type: Schema.Types.ObjectId,
        ref: 'Game'
    }
});

var Deck = db.model('Deck', DeckSchema);*/

var PlayerSchema = Schema({
    profile: {
        type: Schema.Types.ObjectId,
        ref: 'Profile'
    },
    hand: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'Card'
        }]
    }
});

var GameActionSchema = Schema({
    type: {
        type: String,
        required: true,
        index: true
    },
    timestamp: { type: Date, "default": Date.now },
    data: {
        card: {
            type: Schema.Types.ObjectId,
            ref: 'Card'
        },
        position: {
            x: {
                type: Number
            },
            y: {
                type: Number
            }
        }
    },
    _player: {
        type: Schema.Types.ObjectId,
        ref: 'Profile'
    },
    _game: {
        type: Schema.Types.ObjectId,
        ref: 'Game'
    }
});

var GameAction = db.model('GameAction', GameActionSchema);

var GameSchema = Schema({
    players: {
        type: [PlayerSchema],
        required: true
    },
    decks: {
        type: [{
            cards: [{
                type: Schema.Types.ObjectId,
                ref: 'Card'
            }]
        }],
        required: true
    },
    table: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'Card'
        }]
    },
    actions: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'GameAction'
        }]
    }
});

var Game = db.model('Game', GameSchema);

// Routes

app.get("/", function (req, res) {
    res.render("index", {
        version: version,
        env: process.env.NODE_ENV || "development"
    });
});

// API

// Profiles API

// http://blog.apigee.com/detail/restful_api_design_plural_nouns_and_concrete_names/

app.get("/api/v1/profiles", function (req, res, next) {
    Profile.find({}, 'first_name username', function (err, profiles) {
        if (err) return next(err);
        res.send(profiles);
    });
});

app.get("/api/v1/profiles/search", function (req, res, next) {
    var term = req.query.term;
    // Escape regex characters
    term = term.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
    Profile.find({ username: new RegExp("^"+term,"i") }, 'first_name username', function (err, profiles) {
        if (err) return next(err);
        res.send(profiles);
    });
});

app.post("/api/v1/profiles", function (req, res, next) {
    var username = (req.body.username || "").toLowerCase();
    req.body.username = username;
    var profile = new Profile(req.body);
    profile.save(function (err) {
      if (err) return next(err);
      console.log(req.body);
      return res.send(201, profile.toJSON());
    });
});

app.get("/api/v1/profiles\\(username\\)/:username", function (req, res, next) {
    var username = (req.params.username || "").toLowerCase();
    Profile.findOne({ username : username }, 'first_name', function (err, profile) {
        if (err) return next(err);
        if(profile){
            return res.send(200, profile.toJSON());
        } else {
            return res.send(404);
        }
    });
});

app.get("/api/v1/profiles/:id", function (req, res, next) {
    Profile.findById(req.params.id, 'first_name', function (err, profile) {
        if (err) return next(err);
        if(profile){
            return res.send(200, profile.toJSON());
        } else {
            return res.send(404);
        }
    });
});

app.get("/api/v1/profiles/:id/games", function (req, res, next) {
    Profile.findById(req.params.id, 'first_name', function (err, profile) {
        if (err) return next(err);
        if(profile){
            Game.find({ "players.profile": profile._id }, "players")
            .populate("players.profile", "username")
            .exec(function (err, games) {
                if (err) return next(err);
                if(games){
                    return res.send(200, games);
                } else {
                    return res.send(404);
                }
            });
        } else {
            return res.send(404);
        }
    });
});

// Games API

app.get("/api/v1/games", function (req, res, next) {
    Game.find({}, "players")
        /*.populate("players.profile", "username")*/ // FIXME: This crashes the app.
        .populate("players.hand")
        .exec(function (err, games) {
            if (err) return next(err);
            if(games){
                return res.send(200, games);
            } else {
                return res.send(404);
            }
        });
});

var ranks = ["ace","2","3","4","5","6","7","8","9","10","jack","king","queen"];
var suits = ["spades","clubs","hearts","diamonds"];

/*deferred.monitor(5000, function(err){
    logger.error(err.stack);
});*/

app.post("/api/v1/games", function (req, res, next) {
    var game = new Game();

    var creator = req.body.creator;// || "scinvention";
    var players = req.body.players;// || ["jonathanstraub"];

    players.unshift(creator.toLowerCase());

    console.log(players);

    fetchProfilesByUsername(players)
    .then(function(profiles){

        console.log(profiles);
        if(profiles.length !== players.length){
            throw new Error("players not found");
        }

        _.each(profiles, function(profile){
            game.players.push({ profile: profile, hand: [] });
        });

    }).then(function(){

        var deckSpecs = [];
        for(var i = 0; i < 2; i++){
            deckSpecs.push({ shuffled: true, game: game });
        }

        return deckSpecs;
    })
    .then(createDecks)
    .then(function(decks){

        console.log(decks);
        game.decks.push.apply(game.decks, decks);
        return game;
    })
    .then(saveMongooseDoc)
    .then(function(){

        // Populate back references now that we have a game.
        _.each(game.players, function(player){
            Profile.findByIdAndUpdate(player.profile,
                { $push : { games : game._id } }).exec();
        });

        return Game.findById(game._id)
            .populate("decks.cards")
            .populate("table")
            .populate("players.profile", "username");
    })
    .then(execMongooseQuery)
    .then(function (game) {
        return res.send(201, game.toJSON());
    }, function (err) {
        return next(err);
    });
});

function fetchProfilesByUsername(usernames) {
    return execMongooseQuery(Profile.find({ username: { $in: usernames } }));
}

function fetchProfileByUsername(username) {
    var def = when.defer();
    def.resolve(
        fetchProfilesByUsername([username]).then(function(profiles){
            return profiles && profiles.length ? profiles[0] : undefined;
        })
    );
    return def.promise;
}

function createDecks(deckSpecs) {

    var decksPromise = when.map(deckSpecs, createDeck);

    return decksPromise;
}

function createDeck(deckSpec) {
    var def = when.defer(),
    deck = { cards: [] };
    cards = [],
    shuffled = deckSpec.shuffled,
    game = deckSpec.game;

    for(var suit in suits){
        suit = suits[suit];
        for(var rank in ranks){
            rank = ranks[rank];

            var card = new Card({
                rank: rank,
                suit: suit,
                face: true,
                position: {
                    x: 0,
                    y: 0
                },
                _game: game._id
            });

            cards.push(card);
        }
    }

    console.log("cards length: "+cards.length);

    var cardsPromise = when.map(cards, saveMongooseDoc);

    if(shuffled) fisherYatesShuffle(cards);

    def.resolve(cardsPromise.then(function(cards){
        deck.cards.push.apply(deck.cards, cards);
        return deck;
    }));

    return def.promise;
}

function fisherYatesShuffle(array) {
  var i = array.length;
  if ( i === 0 ) return false;
  while( --i ){
     var j = Math.floor( Math.random() * ( i + 1 ) );
     var tempi = array[i];
     var tempj = array[j];
     array[i] = tempj;
     array[j] = tempi;
   }
}

function saveMongooseDoc(doc){
    var def = when.defer();
    doc.save(function(err){
        if(err) return def.reject(err);
        return def.resolve(doc);
    });
    return def.promise;
}

function execMongooseQuery(query){
    var def = when.defer();
    query.exec(function(err, result){
        if(err) return def.reject(err);
        return def.resolve(result);
    });
    return def.promise;
}

app.get("/api/v1/games/:id", function (req, res, next) {
    Game.findById(req.params.id, "players table decks")
        .populate("table")
        .populate("players.hand")
        .populate("players.profile", "username")
        .exec(function (err, game) {
            if (err) return next(err);
            if(game){
                var safeGame = game.toJSON();

                safeGame.decks = _.map(safeGame.decks, function(deck){
                    return { length: deck.cards.length };
                });

                return res.send(200, safeGame);
            } else {
                return res.send(404);
            }
        });
});

app.get("/api/v1/games/:id/decks", function (req, res, next) {
    Game.findById(req.params.id, "players decks")/*.populate("decks.cards")*/.exec(function (err, game) {
        if (err) return next(err);
        if(game){
            return res.send(200, game.decks.toJSON());
        } else {
            return res.send(404);
        }
    });
});

app.get("/api/v1/games/:id/decks/:deckIndex", function (req, res, next) {
    Game.findById(req.params.id, "players decks", function (err, game) {
        if (err) return next(err);
        if(game && game.decks[req.params.deckIndex]){
            var cards = [];
            console.log(game.decks[req.params.deckIndex]);
            async.forEachSeries(game.decks[req.params.deckIndex],
                function(card, done){
                    Card.findById(card).exec(function(err, card){
                        if (err) return done(err);
                        cards.push(card.toJSON());
                        done();
                    });
                },
                function (err){
                    if (err) return next(err);
                    return res.send(200, { cards: cards });
                }
            );
            
        } else {
            return res.send(404);
        }
    });
});

app.post("/api/v1/games/:id/decks/:deckIndex/draw", function (req, res, next) {
    Game.findById(req.params.id, "players decks table")
        .populate("players.profile", "username")
        .exec(function (err, game) {
            if (err) return next(err);

            if(game && game.decks[req.params.deckIndex]){

                var cards = game.decks[req.params.deckIndex].cards.splice(0, 1);
                if(cards.length){

                    var activePlayer = _.find(game.players, function(player){
                        return player.profile.username === (req.body.player || "").toLowerCase();
                    });

                    if(activePlayer){
                        var player = game.players.id(activePlayer);

                        player.hand.push.apply(player.hand, cards);

                        game.save(function (err, game){
                            var retCards = [];
                            async.forEachSeries(cards, function(card, done){
                                Card.findById(card, function(err, card){
                                    if (err) return done(err);

                                    retCards.push(card);
                                    done();
                                });
                            }, function(err){
                                if (err) return next(err);

                                broadcastGameMessage(null, "cardAction", game._id, "draw", {
                                    deckIndex: req.params.deckIndex,
                                    player: player.profile.username,
                                    num: cards.length
                                });

                                return res.send(200, retCards);
                            });
                        });
                    } else {
                        return res.send(403);
                    }
                } else {
                    return res.send(404);
                }
            } else {
                return res.send(404);
            }
        });
});

server.listen(app.get("port"), function(){
    logger.info("Express server listening on port " + app.get("port") + " in " + app.settings.env + " mode.");
});

// Socket.IO

// Initialize socket.io
io = io.listen(server, {
    "logger": logger,

    "browser client minification": true,  // send minified client
    "browser client etag": true,          // apply etag caching logic based on version number
    "browser client gzip": true,          // gzip the file

    "log level": 1 //process.env.NODE_ENV === "production" ? 1 : 2
});

// Setup graceful shutdown procedure.
process.on('SIGTERM', function () {

    logger.info("Server: shutdown signal received.");

    logger.info("Server: alerting active users of shutdown.");
    io.sockets.emit('announcement', {
        title: "Server shutting down...",
        text: "It should probably be back online shortly. If not, contact David.",
        time: 30000
    });

    // Close server (stop accepting new requests and wait for all existing clients to disconnect or timeout).
    server.close(function(){

        logger.info("Server: last client disconnected, exiting.");
        process.exit();

    });
    logger.info("Server: no longer accepting new requests, waiting for existing clients to disconnect...");

    setTimeout(function(){
        logger.warn("Timeout reached, forcefully shutting down server.");
        process.exit();
    }, 30*1000);
});

var usernames = {};

io.sockets.on('connection', function (socket) {
    socket.emit('usernames', usernames);

    socket.on('user message', function (msg) {
        socket.broadcast.emit('user message', socket.username, msg);
    });

    //console.log(io.sockets["in"]("game:508eaffc594eca8f40000003").clients());

    socket.on('userLoggedIn', function (user, fn) {
        console.log("received username: "+ user);
        /*if (usernames[user]) {
            if(fn) fn(true);
        } else {*/
            if(fn) fn(false);
            user = (user || "").toLowerCase();
            usernames[user] = socket.username = user;
            socket.broadcast.emit('announcement', {
                title: user + ' connected.'
            });
            io.sockets.emit('usernames', usernames);
        /*}*/
    });

    socket.on('userLoggedOut', function (user, fn) {
            if (!socket.username) return;
            if(fn) fn(false);
            delete usernames[socket.username];
            socket.broadcast.emit('announcement', {
                title: user + ' disconnected.'
            });
            io.sockets.emit('usernames', usernames);
    });

    socket.on("adminBroadcast", function(data){
        if(data.secret !== "1gfhsjkyei764mkfme0jjd") return;
        delete data.secret;
        io.sockets.emit('announcement', data);
    });

    socket.on('game:subscribe', function(data) { socket.join("game:"+data.id); });

    socket.on('game:unsubscribe', function(data) { socket.leave("game:"+data.id); });

    socket.on('game:cardAction', function(data, fn) {
        var gameId = data.gameId,
            actionType = data.actionType,
            actionData = data.actionData;

        switch(actionType){
            case "move":
                Card.findByIdAndUpdate(actionData.cardId, { $set: { position: actionData.position }}).exec(function(err){
                    if(err){
                        fn(false);
                        return logger.error(err);
                    }

                    broadcastGameMessage(socket, "cardAction", gameId, actionType, actionData);

                    if(actionData.drop){
                        Game.findById(gameId, function(err, game){
                            var action = new GameAction({
                                type: "cardDrop",
                                data: {
                                    card: actionData.cardId,
                                    position: actionData.position
                                },
                                _game: gameId
                            });
                            action.save();
                            game.actions.push(action);
                            game.save();
                        });
                    }

                    fn(true);
                });
                break;
            case "flip":
                Card.findByIdAndUpdate(actionData.cardId, { $set: { face: actionData.face }}).exec(function(err){
                    if(err){
                        fn(false);
                        return logger.error(err);
                    }

                    broadcastGameMessage(socket, "cardAction", gameId, actionType, actionData);

                    fn(true);
                });
                break;
            case "play":
                Game.findById(gameId, "players decks table")
                    .populate("players.profile", "username")
                    .populate("players.hand")
                    .exec(function(err, game){
                        if(err){
                            fn(false);
                            return logger.error(err);
                        }
                        var activePlayer = _.find(game.players, function(player){
                            return (player.profile.username || "").toLowerCase() === (actionData.player || "").toLowerCase();
                        });

                        if(activePlayer){
                            var player = game.players.id(activePlayer);

                            var card = _.find(player.hand, function(card){
                                console.log(card._id);
                                console.log(actionData.cardId);
                                console.log(card._id.toString() === actionData.cardId.toString());
                                return card._id.toString() === actionData.cardId.toString();
                            });

                            console.log(card);

                            if(card){
                                player.hand.remove(card._id);

                                card.position = actionData.position;
                                card.save();

                                game.table.push(card);

                                game.save(function(err){
                                    if(err){
                                        fn(false);
                                        return logger.error(err);
                                    }

                                    actionData.card = card.toJSON();

                                    broadcastGameMessage(socket, "cardAction", gameId, actionType, actionData);

                                    fn(true);
                                });
                            }
                        }
                    });
                break;
            case "take":
                Game.findById(gameId, "players decks table")
                    .populate("players.profile", "username")
                    .populate("players.hand")
                    .populate("table")
                    .exec(function(err, game){
                        if(err){
                            fn(false);
                            return logger.error(err);
                        }
                        var activePlayer = _.find(game.players, function(player){
                            return (player.profile.username || "").toLowerCase() === (actionData.player || "").toLowerCase();
                        });

                        if(activePlayer){
                            var player = game.players.id(activePlayer);

                            var card = _.find(game.table, function(card){
                                console.log(card._id);
                                console.log(actionData.cardId);
                                console.log(card._id.toString() === actionData.cardId.toString());
                                return card._id.toString() === actionData.cardId.toString();
                            });

                            console.log(card);

                            if(card){
                                game.table.remove(card._id);

                                /*card.position = actionData.position;
                                card.save();*/

                                player.hand.push(card);

                                game.save(function(err){
                                    if(err){
                                        fn(false);
                                        return logger.error(err);
                                    }

                                    //actionData.card = card.toJSON();

                                    broadcastGameMessage(socket, "cardAction", gameId, actionType, actionData);

                                    fn(true);
                                });
                            }
                        }
                    });
                break;
            default:
                logger.error("received unrecognized cardAction: "+data.actionType);
                break;
        }
    });

    socket.on('game:playerMouseMove', function(data, fn){
        var gameId = data.gameId,
            actionType = data.actionType,
            actionData = data.actionData;

            broadcastGameMessage(socket, "playerMouseMove", gameId, actionType, actionData);

            //socket.broadcast.to("game:"+gameId).emit('game:playerMouseMove', data);
    });

    socket.on('disconnect', function () {
        if (!socket.username) return;

        delete usernames[socket.username];
        socket.broadcast.emit('announcement', {
            title: socket.username + ' disconnected.'
        });
        socket.broadcast.emit('usernames', usernames);
    });
});

function broadcastGameMessage(socket, messageType, gameId, actionType, actionData, callback) {
    /*var clients = io.sockets["in"]("game:"+gameId).clients();

    async.forEach(clients,
        function (client, done){
            if(senderId && client.id === senderId) return done();
            client.emit("game:cardAction", {
                actionType: actionType,
                actionData: actionData
            });
            done();
        },
        function (err){
            if (err) return logger.error(err);
        }
    );*/

    (socket ?
        socket.broadcast.to("game:"+gameId) :
        io.sockets["in"]("game:"+gameId)
    ).emit("gameMessage", {
        gameId: gameId,
        messageType: messageType,
        actionType: actionType,
        actionData: actionData
    }, callback);
}