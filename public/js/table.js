
// Set up namespace
var app = app || {};
(function( $, _, Backbone, window, document, undefined ) {

var self = this;
// Use "self" only where "this" is unavailable
// due to a scope change

// Setup App Properties

this.apiVersion = "v1";
this.resourceVersion = "2";

this.clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
});

// app.profile is defined when a user is logged in.
this.profile = undefined;

// app.socketConnected indicates whether the socket.io connection event has fired.
this.socketConnected = false;

// Setup event bus
_.extend(Backbone.Events,
{
    once: function(ev, callback, context) {
        var bindCallback = _.bind(function() {
            this.unbind(ev, bindCallback);
            callback.apply(context || this, arguments);
        }, this);

        this.bind(ev, bindCallback);
    }
});
this.vent = _.extend({}, Backbone.Events);

// Setup Router

var AppRouter = Backbone.Router.extend({
    routes: {
        "register" : "register",
        "login" : "login",
        "logout" : "logout",
        "games" : "games",
        "games/:id": "getGame",
        "*actions": "login"
    },
    login: function(){
        if(app.profile){
            app.router.navigate("/games", { trigger: true });
        } else {
            app.view.setView(".content", new LoginView()).render();
        }
    },
    logout: function(){
        if(app.profile){
            app.profile.logOut();
        }
        app.router.navigate("/login", { trigger: true });
    },
    register: function(){
        if(app.profile){
            app.router.navigate("/games", { trigger: true });
        } else {
            var loginView = app.view.getView(function(view){ return view.tempProfile; });
            var tempProfile = loginView && loginView.tempProfile;
            app.view.setView(".content", new RegisterView({ tempProfile: tempProfile })).render();
        }
    },
    games: function(){
        if(!app.profile){
            app.router.navigate("/login", { trigger: true });
        } else {
            app.view.setView(".content", new GamesView());
        }
    },
    getGame: function(id){
        if(!app.profile){
            app.router.navigate("/login", { trigger: true });
        } else {
            app.view.setView(".content", new GameView({ id: id }));
        }
    }
});

this.router = new AppRouter();

// Setup socket.io communication

var socket = app.socket = io.connect();

socket.on("connect", function(){
    app.socketConnected = true;
    console.log("socketConnected");
    app.emitQueuedMessages();
    $.gritter.add({
        title: "Connected.",
        text: "&nbsp;",
        time: 3000
    });
    app.vent.trigger("socket:connect");
});

socket.on('announcement', function(data) {
    $.gritter.add({
        title: data.title || data,
        text: data.text || "&nbsp;",
        time: data.time || 3000,
        sticky: data.sticky || false
    });
    app.vent.trigger("socket:announcement", data);
});

socket.on("gameMessage", function(data, callback){
    if(data.clientId && data.clientId === app.clientId) return;
    app.vent.trigger("game:"+(data.gameId)+":message", data, callback);
});

socket.on('disconnect', function() {
    $.gritter.add({
        title: "Disconnected from server.",
        text: "This may be due to a faulty Internet connection, trouble with the server, or a regularly scheduled shutdown of the server. Please contact David if any problems persist.",
        time: 10000
    });
    app.vent.trigger("socket:disconnect");
});

socket.on('reconnect', function() {
    $.gritter.add({
        title: "Reconnected to server.",
        text: "Your connection has been restored. Please contact David if any problems persist.",
        time: 10000
    });

    app.vent.trigger("socket:reconnect");

    if(app.profile){
        app.emitMessage("username", app.profile.get("username"));
    }
});
socket.on('user message', function(username, msg) {
    console.log(username+" says: "+msg);
});
socket.on('usernames', function(usernames) {
    console.log(usernames);
    app.view.$(".active-users-count").text(_.keys(usernames).length);
});

//Setup LayoutManager

Backbone.LayoutManager.configure({
    render: function(template, context) {
        return template(context);
    },
    fetch: function(path) {
        var done = this.async();
        
        if( !path.match(/\.hbs$/) ){
            path = path + ".hbs";
        }

        $.get(path, function(contents) {
            done(Handlebars.compile(contents));
        });
    },

    // LayoutManager handles all backbone views.
    manage: true,
    
    prefix: "/js/templates/"
});

// Embellish Backbone Core

Backbone.Model.prototype.fetchByUniqueKey = function(key, value, options){
    if( typeof value === "object" ){
        options = value;
        value = undefined;
    }
    if(!value) value = this.get(key);
    options = options ? _.clone(options) : {};
    var model = this;
    options.url = this.urlRoot+"("+key+")/"+value;
    var success = options.success;
    options.success = function(resp, status, xhr) {
        if (!model.set(model.parse(resp, xhr), options)) return false;
        if (success) success(model, resp);
    };
    options.error = Backbone.wrapError(options.error, model, options);
    return (this.sync || Backbone.sync).call(this, 'read', this, options);
};

// Handlebars Helpers

Handlebars.registerHelper("debug", function(optionalValue) {
    console.log("Current Handlebars context");
    console.log(this);
    
    if(optionalValue) {
        console.log("Value");
        console.log(optionalValue);
    }
});

// Backbone Objects

this.models = {};

var Profile = this.models.Profile = Backbone.Model.extend({
    urlRoot: "/api/"+app.apiVersion+"/profiles",
    idAttribute: "_id",

    logIn: function(){
        app.profile = this;
        store.set("app."+app.resourceVersion+".profile", this.toJSON());
        app.emitMessage("userLoggedIn", this.get("username"));
    },
    logOut: function(){
        app.emitMessage("userLoggedOut", this.get("username"));
        app.profile = undefined;
        store.clear();
    },

    compareUsernames: function(otherUsername){
        return Profile.compareUsernames(this.get("username"), otherUsername);
    }
});

Profile.compareUsernames = function(user1, user2){
    if(_.isString(user1) && _.isString(user2)){
        return user1.toLowerCase() == user2.toLowerCase();
    }
    return false;
};

var Game = this.models.Game = Backbone.Model.extend({
    urlRoot: "/api/"+app.apiVersion+"/games",
    idAttribute: "_id"
});

var Card = this.models.Card = Backbone.Model.extend({
    idAttribute: "_id"
});

var Deck = this.models.Deck = Backbone.Model.extend({
});

this.collections = {};

var Games = this.collections.Games = Backbone.Collection.extend({
    model: Game,

    url: function(){
        return app.profile ?
            "/api/"+app.apiVersion+"/profiles/"+app.profile.get("_id")+"/games" :
            "/api/"+app.apiVersion+"/games";
    },

    initialize: function(){

    }
});

var Table = this.collections.Table = Backbone.Collection.extend({
    model: Card
});

var Hand = this.collections.Hand = Backbone.Collection.extend({
    model: Card
});

this.views = {};

var LoginView = this.views.LoginView = Backbone.View.extend({
    template: "login",
    
    initialize: function(){
        this.tempProfile = this.options.tempProfile || new Profile();
        this.profileBinder = new Backbone.ModelBinder();
    },
    
    events: {
        "submit [name=login_form]" : "doLogin"
    },
    
    afterRender: function(){
        this.profileBinder.bind(this.tempProfile, this.el);
    },
    
    doLogin: function(e){
        e.preventDefault();
        
        this.tempProfile.fetchByUniqueKey("username", {
            success: function(model, resp, options){
                model.logIn();

                app.router.navigate("/games", { trigger: true });
            },
            error: function(model, resp, options){
                console.log("tempUser sync error");
                console.log(model);
                console.log(resp);
                console.log(options);
                
                app.router.navigate("/register", { trigger: true });
            }
        });
    }
});

var RegisterView = this.views.RegisterView = Backbone.View.extend({
    template: "register",
    
    initialize: function() {
        this.tempProfile = this.options.tempProfile || new Profile();
        this.profileBinder = new Backbone.ModelBinder();
    },
    
    events: {
        "submit [name=register_form]" : "doRegister"
    },
    
    afterRender: function(){
        this.profileBinder.bind(this.tempProfile, this.el);
    },
    
    doRegister: function(e){
        e.preventDefault();
        
        this.tempProfile.save(null, {
            success: function(model, resp, options){
                model.logIn();

                app.router.navigate("/games", { trigger: true });
            }
        });
    }
});

var GameListItemView = this.views.GameListItemView = Backbone.View.extend({
    tagName: "li",
    template: "game_list_item",

    initialize: function(){
        this.model = this.game = this.options.game;
    },

    data: function(){
        return { id: this.game.get("_id"), otherPlayers: this.getOtherPlayers().join(", ") };
    },

    getOtherPlayers: function(){
        return _.map(_.filter(this.game.get("players"), function(player){
            return !app.profile.compareUsernames(player.profile.username);
        }),
        function(player){
            return player.profile.username;
        });
    }
});

var GamesView = this.views.GamesView = Backbone.View.extend({
    tagName: "div",
    className: "table",
    template: "games",
    
    initialize: function() {
        var view = this;
        var coll = this.games = this.collection = new Games();
        //coll.on("reset", this.render, this);

        coll.on("add", function(game){
            console.log("game added");
            var gameListItemView = new GameListItemView({
                game: game
            });
            view.insertView(".games", gameListItemView).render();
        });

        coll.fetch({
            success: function(model, response){
                view.render();
            }
        });
    },

    data: function(){
        return { profile: app.profile.toJSON() };
    },
    
    events: {
        "submit [name=create_game_form]" : "createGame",
        "click [name=create_game_form] .add-player" : "addPlayer"
    },

    beforeRender: function() {
        console.log((new Error()).stack);
        console.log("before render games. length: "+this.games.length);
        this.games.each(function(game) {
            console.log("iterated over a game: "+game.get("_id"));
            this.insertView(".games", new GameListItemView({
                game: game
            }));
        }, this);
        
    },
    afterRender: function(){
        this.rendering = false;
        console.log("after render games. length: "+this.games.length);

        this.autocompleteify(this.$("[name=create_game_form] [name^=player]"));
    },

    autocompleteify: function($input){
        var view = this;

        $input.autocomplete({
            delay: 500,
            source: function( request, response ) {
                var term = request.term;
                /*if ( term in cache ) {
                    response( cache[ term ] );
                    return;
                }*/
 
                $.getJSON( "/api/"+app.apiVersion+"/profiles/search", request, function( data, status, xhr ) {
                    //cache[ term ] = data;
                    var users = _.map(data, function(user){
                        return {
                            value: user.username
                        };
                    });
                    response( users );
                });
            },
            select: function( event, ui ) {
                var $elem = $(this);
                var name = $elem.attr("name");
                var username = ui.item.value;
                $elem.parent().html($("<span />").attr("name", name).text(username));
                view.$(".add-player").show();
            }
        });

        return $input;
    },

    addPlayer: function(e){
        e.preventDefault();
        var currentPlayerNum = parseInt(this.$("[name=create_game_form] [name^=player]")
            .last().attr("name").replace(/^player/,""), 10);

        var $elem = $("<li><input type='text' name='player"+(currentPlayerNum+1)+"' /></li>");

        $elem.appendTo(this.$("[name=create_game_form] ol"));
        this.autocompleteify($elem.find("input"));

        this.$(".add-player").hide();
    },
    
    createGame: function(e){
        e.preventDefault();

        var players = [];
        this.$("[name=create_game_form] [name^=player]").each(function(i, elem){
            players.push($(elem).text());
        });

        this.games.create({ creator: app.profile.get("username"), players: players }, { wait: true });
    }
});

var CardView = this.views.CardView = Backbone.View.extend({
    tagName: "li",
    className: "card",
    template: "card",

    initialize: function(){
        var view = this;
        this.gameView = this.options.gameView;
        var card = this.card = (this.model || (this.model = new Card()));
        card.set({
            _game: this.options.game.get("_id")
        });
        card.on("change", function(){
            view.render();
        });
        /*card.on("change:position", function(){
            var pos = this.model.get("position");
            this.$el.css({
                top: pos.y+"%",
                left: pos.x+"%"
            });
        });
        card.on("change:face", function(){
            this.$el.animate({
                width: 0
            }, 500, "");
        });*/
    },
    cleanup: function(){
        this.card.off();
        this.card = undefined;
        this.gameView = undefined;
    },

    events: {
        "contextmenu": "flipCard"/*,
        "mousedown": "flipCard"*/
    },

    getSuitEntity: function(){
        return CardView.suitEntities[this.card.get("suit")];
    },
    getDisplayRank: function(){
        var rankString = (this.card.get("rank") || "").toString();
        return (rankString.length > 2 ? rankString.substr(0,1) : rankString).toUpperCase();
    },
    data: function(){
        return _.extend({}, this.card.toJSON(), !this.card.get("face") ? {} : { suitEntity: this.getSuitEntity(), displayRank: this.getDisplayRank() });
    },

    beforeRender: function(){
        var pos = this.model.get("position");
        
        /*if(this.gameView.dragging.card === this.card){*/
            this.$el.css({
                top: pos.y+"%",
                left: pos.x+"%"
            });
        /*} else {
            this.$el.animate({
                top: pos.y+"%",
                left: pos.x+"%"
            }, 50, "linear");
        }*/
        var suit = this.card.get("suit");
        if( suit === "hearts" || suit === "diamonds" ){
            this.$el.addClass("red");
        } else {
            this.$el.addClass("black");
        }
        if(!this.card.get("face")){
            this.$el.addClass("back").removeClass("front");
        } else {
            this.$el.addClass("front").removeClass("back");
        }
    },
    afterRender: function(){
        this.$el.data("cardId", this.model.get("_id"));

        // Setting the width the same as the height.
        var cardHeight = this.$el.width();
        this.$el.add(".face", this.$el).css({
            height: cardHeight+"px"
        });
        var suit = this.$(".suit");
        suit.css({
            "font-size": (cardHeight*1.5)+"px",
            "margin-top": "-"+(cardHeight*0.55)+"px"
        });
        var rank = this.$(".rank");
        rank.css({
            "font-size": (cardHeight/2)+"px",
            "margin-top": "-"+((cardHeight/2)/2)+"px"
        });
    },

    flipCard: function(e){
        e.preventDefault();

        // Ignore left click.
        if ((e.which && e.which != 3) || (e.button && e.button != 2)) return;

        // Handle touch events.
        if(e.originalEvent.touches && e.originalEvent.touches.length) {
            e = e.originalEvent.touches[0];
        } else if(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length) {
            e = e.originalEvent.changedTouches[0];
        }

        var $target = $(e.target);
        var $card = $target.hasClass(".card") ? $target : $target.closest(".card");
        if($card.size() < 1) return;

        /*var card = this.gameView.table.where({ _id: $card.data("cardId") })[0];
        if(!card) return;*/
        var card = this.card;

        card.set("face", !card.get("face"));

        app.emitMessage("game:cardAction", {
            gameId: this.gameView.model.get("_id"),
            actionType: "flip",
            actionData: {
                cardId: card.get("_id"),
                face: card.get("face"),
                player: app.profile.get("username")
            }
        }, function(success){
            if(!success) {
                console.log("server error moving card");
            }
        });
    }
});

CardView.suitEntities = {
    "spades": "&spades;",
    "clubs": "&clubs;",
    "hearts": "&hearts;",
    "diamonds": "&diams;"
};

var DeckView = this.views.DeckView = Backbone.View.extend({
    tagName: "li",
    className: "deck",
    template: "deck",

    initialize: function(){
        this.game = this.options.game;
        this.gameView = this.options.gameView;
        this.index = this.options.index;
        this.length = this.options.length;
    },

    events: {
        "click .draw": "drawCard"
    },

    data: function(){
        return { index: this.index, length: this.length };
    },

    beforeRender: function(){
        /*var pos = this.position;
        this.$el.css({
            top: pos.y+"%",
            left: pos.x+"%"
        });*/
    },
    afterRender: function(){
        /*this.$el.data("deckIndex", this.index);*/
    },

    drawCard: function(e){
        e.preventDefault();

        var view = this;
        $.ajax({
            url: "/api/"+app.apiVersion+"/games/"+this.game.get("_id")+"/decks/"+this.index+"/draw",
            type: "post",
            dataType: "json",
            data: {
                player: app.profile.get("username")
            },
            success: function(cards){
                var handView = view.gameView.getView(function(view){
                    return !!view.hand;
                });
                handView.hand.add(cards);
                handView.render();
                /*view.length--;
                view.render();

                var player = _.find(view.gameView.game.get("players"),
                function(player){
                   return (player.profile.username || "").toLowerCase() === (app.profile.get("username") || "").toLowerCase();
                });
                player.hand = handView.hand.toJSON();

                view.gameView.getViews(function(view){
                    console.log("searching views");
                    console.log(view.player);
                    if(view.player){
                        console.log(view.player.profile.username);
                        console.log(app.profile.get("username"));
                    }
                    return view.player &&
                        (view.player.profile.username || "").toLowerCase() === (app.profile.get("username") || "").toLowerCase();
                }).each(function(view){ view.render(); });*/

                view.gameView.adjustCardsContainerSize();
            }
        });
    }
});

var PlayerView = this.views.PlayerView = Backbone.View.extend({
    tagName: "li",
    className: "player",
    template: "player",

    initialize: function(){
        this.game = this.options.game;
        this.gameView = this.options.gameView;
        var player = this.player = this.model;
        console.log("player");
        console.log(player);
    },

    events: {
    },

    data: function(){
        return this.model;
    },

    beforeRender: function(){
        /*var pos = this.position;
        this.$el.css({
            top: pos.y+"%",
            left: pos.x+"%"
        });*/
    },
    afterRender: function(){
        /*this.$el.data("deckIndex", this.index);*/
    }
});

var HandView = this.views.HandView = Backbone.View.extend({
    tagName: "div",
    className: "hand",
    template: "hand",

    initialize: function(){
        var view = this;
        this.game = this.options.game;
        this.gameView = this.options.gameView;
        this.length = this.options.length;

        var hand = this.hand = this.collection = new Hand();
        hand.reset(this.options.cards);

        hand.on("add", function(card){
            console.log("card added to hand");
            view.insertView(".cards", new CardView({
                model: card,
                game: view.game,
                gameView: view.gameView
            })).render();
        });
        hand.on("remove", function(card){
            console.log("card removed from hand");
            view.getViews(function(cardView) {
                return cardView.card === card;
            }).each(function(cardView){
                cardView.remove();
                cardView.$el.remove();
            });
        });
    },

    events: {
        /*"click .card": "playCard"*/
    },

    data: function(){
        return { index: this.index, length: this.length };
    },

    beforeRender: function(){
        var view = this;
        view.hand.each(function(card){
            view.insertView(".cards", new CardView({
                model: card,
                game: view.game,
                gameView: view.gameView
            }));
        });
    },
    afterRender: function(){
        
        this.$el.css({
            height: (this.$(".card").outerWidth()*1.5 || 0)
        });

        this.gameView.adjustCardsContainerSize();
    },

    playCard: function(e){
        e.preventDefault();
    }
});

var GameView = this.views.GameView = Backbone.View.extend({
    tagName: "div",
    className: "table",
    template: "game",
    
    initialize: function() {
        var view = this;
        var game = this.model = this.game = new Game();

        game.set({ _id: this.options.id });

        var table = this.table = this.collection = new Table();

        table.on("add", this.addCardViewToTable, this);
        table.on("remove", this.removeCardViewFromTable, this);

        this.$cards = $();

        app.vent.on("socket:reconnect", this.reconnect, this);
        app.vent.on("game:"+game.get("_id")+":message", this.handleGameMessage, this);

        // app.socket.on("game:cardAction", _.bind(this.handleGameMessage, this));

        this.playersMouseIcons = {};
        this.playersMouseIconTimeouts = {};

        /*app.socket.on("game:playerMouseMove", function (data){
            view.updatePlayerIcon(data.actionData.player, data.actionData.position);
        });*/

        this.connect();

        game.on("change:table", this.resetTable, this);
        game.on("change:players", this.resetPlayersHand, this);

        game.fetch({
            success: function(model, response){
                view.render();
            }
        });

        $(window).on("resize", _.bind(this.handleResize, this));
    },
    cleanup: function(){
        this.disconnect();

        app.socket.off("game:cardAction game:playerMouseMove");

        this.table.off(null, null, this);
        this.collection = this.table = undefined;

        app.vent.off(null, null, this);

        this.game.off(null, null, this);
        this.model = this.game = undefined;

        $(window).off("resize", null, this.handleResize);
    },
    
    events: {
        "mousedown .card": "pickUpCard",
        "mousemove": "moveCard",
        "mouseup": "putDownCard"
    },

    connect: function(){
        app.emitMessage("game:subscribe", { id: this.game.get("_id") });
    },
    handleGameMessage: function (data){
        var view = this,

            gameId = data.gameId,
            messageType = data.messageType,
            actionType = data.actionType,
            actionData = data.actionData,

            card = view.table.where({ _id: data.actionData.cardId })[0];

        switch(messageType){
            case "playerMouseMove":
                this.updatePlayerIcon(actionData.player, actionData.position);
                break;
            case "cardAction":
                console.log(data);
                switch(actionType){
                    case "move":
                        if(card)
                            card.set({
                                position: actionData.position
                            });
                        if(!data.actionData.drop)
                            view.updatePlayerIcon(actionData.player, actionData.position);
                        break;
                    case "play":
                        view.table.add(actionData.card);
                        view.getViews(function(view){
                            return view.player &&
                                Profile.compareUsernames(view.player.profile.username, actionData.player);
                        }).each(function(view){
                            view.player.hand.splice(0, 1);
                            view.render();
                        });
                        break;
                    case "take":
                        view.table.remove(card);
                        view.getViews(function(view){
                            return view.player &&
                                Profile.compareUsernames(view.player.profile.username, actionData.player);
                        }).each(function(view){
                            view.player.hand.push({});
                            view.render();
                        });
                        break;
                    case "flip":
                        if(card) card.set("face", data.actionData.face);
                        break;
                    case "draw":
                        view.getViews(function(view){
                            return typeof(view.index) != "undefined" && view.index === parseInt(actionData.deckIndex, 10);
                        }).each(function(view){
                            view.length = view.length - actionData.num;
                            view.render();
                        });

                        var handView = view.getView(function(view){
                            return !!view.hand;
                        });

                        var player = _.find(view.game.get("players"),
                        function(player){
                           return Profile.compareUsernames(player.profile.username, actionData.player);
                        });
                        if(app.profile.compareUsernames(player.profile.username)){
                            player.hand = handView.hand.toJSON();
                        } else {
                            player.hand.push({});
                        }
                        console.log("player");
                        console.log(player);

                        view.getViews(function(view){
                            if(view.player){
                                console.log(view.player.profile.username);
                                console.log(app.profile.get("username"));
                            }
                            return view.player &&
                                app.profile.compareUsernames(view.player.profile.username);
                        }).each(function(view){ view.render(); });
                        break;
                    default:
                        console.error("received unrecognized cardAction: "+data.actionType);
                        break;
                }
                break;
            default:
                console.error("received unrecognized messageType: "+messageType);
                break;
            }
    },
    reconnect: function(){
        this.connect();
    },
    disconnect: function(){
        app.emitMessage("game:unsubscribe", { id: this.game.get("_id") });
    },

    addCardViewToTable: function(card){
        console.log("card added to table");
        this.insertView("> .cards", new CardView({
            model: card,
            game: this.game,
            gameView: this
        })).render();
    },
    removeCardViewFromTable: function(card){
        console.log("card removed from table");
        this.getViews(function(cardView) {
            return cardView.card === card;
        }).each(function(cardView){
            cardView.remove();
        });
    },

    resetTable: function(){
        this.table.reset(this.game.get("table"));
    },
    resetPlayersHand: function(){
        var player = this.getPlayer();
        this.playersHand = player && player.hand;
    },

    getPlayer: function(){
        if(!app.profile){
            return;
        }
        if(!this.player){
            this.player = _.find(this.game.get("players"), function(player){
                return app.profile.compareUsernames(player.profile.username);
            });
        }
        return this.player;
    },

    handleResize: _.debounce(function(e){
        console.log("resized");
        this.render();
    }, 100),

    beforeRender: function() {
        var view = this;
        var game = this.game;
        console.log("before render");
        this.table.each(function(card) {
            console.log("each card on table");
            view.insertView("> .cards", new CardView({
                model: card,
                game: game,
                gameView: view
            }));
        }, this);

        _.each(game.get("decks"), function(deck, index, list){
            console.log("each deck in game");
            view.insertView(".decks", new DeckView({
                game: game,
                gameView: view,
                index: index,
                length: deck.length
            }));
        }, this);

        _.each(game.get("players"), function(player, index, list){
            console.log("each player in game");
            view.insertView(".players", new PlayerView({
                game: game,
                gameView: view,
                model: player
            }));
        }, this);

        view.setView(".below", new HandView({
            game: game,
            gameView: view,
            cards: this.playersHand || []
        }));
    },
    afterRender: function(){
        console.log("after render");

        this.$cards = this.$("> .cards");

        this.adjustCardsContainerSize();
    },

    adjustCardsContainerSize: function(){
        var windowHeight = $(window).height();

        var offset = this.$el.offset();

        var els = [];

        var verticalPaddingMarginBorder = this.$el.outerHeight(true)-this.$el.height();

        this.$el.css({
            height: (windowHeight-(offset.top*2)-verticalPaddingMarginBorder-16)+"px"
        });

        var cardsVerticalPaddingMarginBorder = this.$cards.outerHeight(true)-this.$cards.height();

        this.$cards.css({
            height: (this.$el.innerHeight()-this.$(".above").outerHeight()-this.$(".below").outerHeight()-cardsVerticalPaddingMarginBorder)+"px"
        });
    },

    dragging: false,

    pickUpCard: function(e){
        if(this.dragging) return;

        // Ignore right click.
        if ((e.which && e.which == 3) || (e.button && e.button == 2)) return;

        // Handle touch events.
        if(e.originalEvent.touches && e.originalEvent.touches.length) {
            e = e.originalEvent.touches[0];
        } else if(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length) {
            e = e.originalEvent.changedTouches[0];
        }

        var $target = $(e.target);
        var $card = $target.hasClass(".card") ? $target : $target.closest(".card");
        if($card.size() < 1) return;

        var offset = $card.offset();

        var cardInTable = $card.closest(".hand").size() <= 0;

        console.log("cardInTable: "+cardInTable);

        var card = (cardInTable ?
            this.table :
            this.views[".below"].hand)
                .where({ _id: $card.data("cardId") })[0];
        if(!card) return;

        this.dragging = {
            card: card,
            $card: $card,
            // Record the offset of the mouse relative to
            // the upper-left corner of the element so we can
            // adjust for it later.
            mouseOffsetX: e.pageX-offset.left,
            mouseOffsetY: e.pageY-offset.top,

            cardInTable: cardInTable
        };

        var cardsOffset = this.$cards.offset();

        cardsOffset.left = (e.touch || e).pageX-cardsOffset.left-this.dragging.mouseOffsetX;
        cardsOffset.top = (e.touch || e).pageY-cardsOffset.top-this.dragging.mouseOffsetY;

        var pos = this.getPercentagePositionRelativeToElem(cardsOffset, this.$cards);

        card.set({
            position: pos
        });

        if(!cardInTable){
            this.views[".below"].hand.remove(card);
            this.views[".below"].getViews(function(cardView) {
                return cardView.card === card;
            }).each(function(cardView){
                cardView.remove();
                cardView.$el.remove();
            });
            this.table.add(card);
        }
        console.log("picked up card");
    },
    moveCard: _.throttle(function(e){

        // Handle touch events.
        if(e.originalEvent.touches && e.originalEvent.touches.length) {
            e = e.originalEvent.touches[0];
        } else if(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length) {
            e = e.originalEvent.changedTouches[0];
        }

        // Don't continue with card functionality if we're not dragging a card.
        if(!this.dragging) return this.trackMouse(e);

        var offset = this.$cards.offset();
        offset.left = (e.touch || e).pageX-offset.left-this.dragging.mouseOffsetX;
        offset.top = (e.touch || e).pageY-offset.top-this.dragging.mouseOffsetY;

        var pos = this.getPercentagePositionRelativeToElem(offset, this.$cards);

        var card = this.dragging.card;

        if(this.dragging.cardInTable){

            /*if(pos.x > 100) pos.x = 100;
            if(pos.x < 0)   pos.x = 0;
            if(pos.y > 100) pos.y = 100;
            if(pos.y < 0)   pos.y = 0;*/
        
            this.publishCardMove(card);
        }

        card.set({
            position: pos
        });

    }, 15),
    publishCardMove: function(card, drop){
        // Uses throttle so that we can sync with the
        // server less frequently than we update our interface.
        this._publishCardMoveThrottle(card);
    },
    _publishCardMoveThrottle: _.throttle(function(card, drop){
        this._publishCardMove(card, drop);
    }, 100),
    _publishCardMoveDebounce: _.debounce(function(card, drop){
        this._publishCardMove(card, drop);
    }, 250),
    _publishCardMove: function(card, drop){
        app.emitMessage("game:cardAction", {
            gameId: this.model.get("_id"),
            actionType: "move",
            actionData: {
                cardId: card.get("_id"),
                position: card.get("position"),
                drop: drop,
                player: app.profile.get("username")
            }
        }, function(success){
            if(!success) {
                console.log("server error moving card");
            }
        });
    },
    putDownCard: function(e){
        if(!this.dragging) return;
        // Make sure we always catch the trailing edge so
        // that the final position of the card is correct.
        if(this.dragging.cardInTable){
            if(this.posWithinTable(this.dragging.card.get("position"))){

                this._publishCardMoveDebounce(this.dragging.card, true);

            } else if(this.posWithinHand(this.dragging.card.get("position"))){

                console.log("card taken");
                this.publishCardTake(this.dragging.card);

                this.table.remove(this.dragging.card);
                this.views[".below"].hand.add(this.dragging.card);

                var player = _.find(this.game.get("players"),
                function(player){
                   return app.profile.compareUsernames(player.profile.username);
                });
                player.hand.push(this.dragging.card.toJSON());
                this.getViews(function(view){
                    return view.player &&
                        app.profile.compareUsernames(view.player.profile.username);
                }).each(function(view){ view.render(); });

            } else {

                var offset = this.$cards.offset();
                offset.left = (e.touch || e).pageX-offset.left-this.dragging.mouseOffsetX;
                offset.top = (e.touch || e).pageY-offset.top-this.dragging.mouseOffsetY;

                var pos = this.getPercentagePositionRelativeToElem(offset, this.$cards);

                if(pos.x > 100) pos.x = 100;
                if(pos.x < 0)   pos.x = 0;
                if(pos.y > 100) pos.y = 100;
                if(pos.y < 0)   pos.y = 0;

                this.dragging.card.set({
                    position: pos
                });

                this._publishCardMoveDebounce(this.dragging.card, true);
            }
        } else {
            if(this.posWithinTable(this.dragging.card.get("position"))){
                console.log("card played");

                var player = _.find(this.game.get("players"),
                function(player){
                   return app.profile.compareUsernames(player.profile.username);
                });
                player.hand.splice(0, 1);
                this.getViews(function(view){
                    return view.player &&
                        app.profile.compareUsernames(view.player.profile.username);
                }).each(function(view){ view.render(); });

                this.publishCardPlay(this.dragging.card);
            } else {

                this.table.remove(this.dragging.card);
                this.views[".below"].hand.add(this.dragging.card);
            }
        }
        console.log("put down card");
        return this.dragging = false;
    },
    publishCardPlay: function(card){
        app.emitMessage("game:cardAction", {
            gameId: this.game.get("_id"),
            actionType: "play",
            actionData: {
                cardId: card.get("_id"),
                position: card.get("position"),
                player: app.profile.get("username")
            }
        }, function(success){
            if(!success) {
                console.log("server error playing card");
            }
        });
    },
    publishCardTake: function(card){
        app.emitMessage("game:cardAction", {
            gameId: this.game.get("_id"),
            actionType: "take",
            actionData: {
                cardId: card.get("_id"),
                player: app.profile.get("username")
            }
        }, function(success){
            if(!success) {
                console.log("server error playing card");
            }
        });
    },

    trackMouse: function(e){
        var offset = this.$cards.offset();
        offset.left = (e.touch || e).pageX-offset.left;
        offset.top = (e.touch || e).pageY-offset.top;

        var pos = this.getPercentagePositionRelativeToElem(offset, this.$cards);

        if(!this.posWithinTable(pos)) return;

        /*if(pos.x > 100) pos.x = 100;
        if(pos.x < 0)   pos.x = 0;
        if(pos.y > 100) pos.y = 100;
        if(pos.y < 0)   pos.y = 0;*/

        app.emitMessage("game:playerMouseMove", {
            gameId: this.model.get("_id"),
            actionData: {
                position: pos,
                player: app.profile.get("username")
            }
        }, function(success){
            if(!success) {
                console.log("server error tracking mouse");
            }
        });
    },
    updatePlayerIcon: function(player, pos){
        var playerIcon = this.playersMouseIcons[player] =
            (this.playersMouseIcons[player] ||
                $("<div class='player-icon' />").text(player).appendTo(this.$cards));

        playerIcon.css({
            top: pos.y+"%",
            left: pos.x+"%"
        }).show();

        if(this.playersMouseIconTimeouts[player]){
            clearTimeout(this.playersMouseIconTimeouts[player]);
        }

        this.playersMouseIconTimeouts[player] =
            setTimeout(function(){
                playerIcon.fadeOut(500);
            }, 2000);
    },

    getPercentagePositionRelativeToElem: function(offset, $elem){
        var height = $elem.outerHeight(),
            width = $elem.outerWidth();

        return {
            x: width > 0 ? ((offset.left || offset.x || 0)/width)*100 : 0,
            y: height > 0 ? ((offset.top || offset.y || 0)/height)*100 : 0
        };
    },
    posWithinTable: function(pos){
        return (
                pos.x <= 100 &&
                pos.x >= 0 &&
                pos.y <= 100 &&
                pos.y >= 0
            );
    },
    posWithinHand: function(pos){
        return (
                pos.x <= 100 &&
                pos.x >= 0 &&
                pos.y >= 100
            );
    }
});

this.view = new Backbone.View({
    el: $("#container"),
    template: "app",
    
    events: {
        "mousemove": "proxyMouseMoveToGame"
    },

    views: {
        ".footer": new Backbone.View({ template: "footer", data: { version: app.version }})
    },
    
    proxyMouseMoveToGame: function proxyMouseMoveToGame(e){
        // FIXME: This doesn't seem to work.
        if(app.view.views[".content"].game){
            if(!app.view.views[".content"].dragging) return;
            
            // Handle touch events.
            if(e.originalEvent.touches && e.originalEvent.touches.length) {
                e = e.originalEvent.touches[0];
            } else if(e.originalEvent.changedTouches && e.originalEvent.changedTouches.length) {
                e = e.originalEvent.changedTouches[0];
            }
            
            var $cards = $(e.target).closest(".cards");
            
            // If the target is inside .cards,
            // then the game view will receive it directly.
            if($cards.size() > 0) return;
            
            app.view.views[".content"].moveCard(e);
        }
    }
});

this.queuedMessages = [];

this.emitMessage = function emitMessage(){
    if(app.socketConnected){
        app.socket.emit.apply(app.socket, arguments);
    } else {
        app.queuedMessages.push(arguments);
    }
};

this.emitQueuedMessages = function emitQueuedMessages(){
    _.each(app.queuedMessages, function(args){
        app.socket.emit.apply(app.socket, args);
    });
};

this.adminBroadcast = function adminBroadcast(data) {
    app.socket.emit("adminBroadcast", data);
};

this.startup = function (e) {
    app.view.render();

    if(store.enabled){
        var profileData = store.get("app."+app.resourceVersion+".profile");
        if(profileData){
            (new Profile(profileData)).logIn();
        }
    }
    
    Backbone.history.start({ pushState: false });
};

$(document).ready(this.startup);

// End namespace setup
}).call(app, jQuery, window._, window.Backbone, window, document);
