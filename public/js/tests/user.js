(function() {
    
    module("user", {
        setup: function(){
        },
        teardown: function(){
        }
    });
    
    test("user properties", function() {
        var testUser = new app.models.User({ firstName: "Frank", email: "frank@straubdev.com" });
        
        equal(testUser.get("firstName"), "Frank", "user is Frank");
        equal(testUser.get("email"), "frank@straubdev.com", "user email is frank@straubdev.com");
    });
    
    asyncTest("login", function() {
        $.mockjax({
            url: "/api/"+app.apiVersion+"/users(*)/*",
            responseTime: 0,
            response: function(settings) {
                console.log(settings);
                var matches = (new RegExp("users[(]([^)]+)[)]/(.*)$")).exec(settings.url);
                this.responseText = {
                    status: 1,
                    user: {
                        firstName: "David"
                    }
                };
                this.responseText.user[matches[1]] = matches[2];
            }
        });
            
        var $fixture = $( "#qunit-fixture" );
        
        var testUser = new app.models.User({ firstName: "Frank", email: "frank@straubdev.com" });
        
        var loginView = new app.views.LoginView({ tempUser: testUser });
        
        loginView.render().done(function(){
            $fixture.append(loginView.$el);
        
            var $email = $("[name=email]", $fixture);
            
            equal($email.val(), "frank@straubdev.com", "email field is populated");
            equal(testUser.get("email"), $email.val(), "LoginView renders user's email");
            
            testUser.set("email", "steve@straubdev.com");
            
            equal(testUser.get("email"), "steve@straubdev.com", "user's email has changed");
            equal(testUser.get("email"), $email.val(), "change to model updates email field");
            
            $email.val("harold@straubdev.com").trigger("change");
            
            equal(testUser.get("email"), "harold@straubdev.com", "change to field updates model");
            
            testUser.on("change", function firstNameWatcher(){
                
                equal(testUser.get("firstName"), "David", "name updated from mock server");
                equal(testUser.get("email"), "harold@straubdev.com", "email did not change");
                
                testUser.off("change", firstNameWatcher);
                
                $.mockjaxClear();
                start();
            });
            
            $("[name=login_form]").submit();
        });
    });
    
    asyncTest("register", function() {
        $.mockjax({
            url: "/api/"+app.apiVersion+"/users",
            responseTime: 0,
            response: function(settings) {
                console.log(settings);
                this.responseText = {
                    status: 1,
                    user: JSON.parse(settings.data)
                };
                this.responseText.user.id = _.uniqueId("testUser");
            }
        });
        
        var testUser = new app.models.User({ firstName: "Frank", email: "frank@straubdev.com" });
        
        ok(testUser.isNew(), "testUser is new");
        
        testUser.save(undefined, { 
            success: function saveSuccess(){
                
                ok(!testUser.isNew(), "testUser is not new");
                
                $.mockjaxClear();
                start();
            }
        });
    });
    
})();