(function() {
    
    module("app", {
        setup: function(){
        
        }
    });
    
    test("app properties", function() {
        ok(app, "app exists");
        ok(app.view, "app has a view");
        ok(app.router, "app has a router");
        ok(app.startup && typeof app.startup === "function", "app has a startup method");
        
        equal(app.apiVersion, "v1", "app uses latest api version");
    });
    
})();