
var Engage = require('engage-api');
var engage = Engage(require('./config/engage.js'));

engage.loadUserProfile(function(err, profile) {
    if (err) {
        console.log('Failed to load user profile: ' + err);
    } else {
        console.log(JSON.stringify(profile));
    }
});

