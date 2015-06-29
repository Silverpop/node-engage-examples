
var Engage = require('engage-api');
var Twit = require('twit');

var engage = Engage(require('./config/engage.js'));
var twitter = new Twit(require('./config/twitter.js'));

var twitterHandles = [];
var twitterListId = null;

/* hash of twitter handle -> (array of recipient id) */
/* {"joelafiosca": [12345, 34567]} */
var recipientIdsByHandle = {};

/* hash of recipient id -> email address */
/* {12345: "jlafiosc@us.ibm.com", 34567: "jlafiosca@silverpop.com"} */
var emailByRecipientId = {};

/* hash of recipient id -> (array of contact list id) */
/* {12345: [77777, 77778], 34567: [77774]} */
var additions = {};

var exportOptions = {
    listId: 4782179,  // Engage database id to sweep for
    exportType: Engage.EXPORT_TYPE.OPT_IN,
    exportColumns: ["Email", "RECIPIENT_ID", "TwitterHandle"],
    forEachCallback: function(rec) {
        if (rec.TwitterHandle) {
            twitterHandles.push(rec.TwitterHandle);
            if (!recipientIdsByHandle[rec.TwitterHandle]) {
                recipientIdsByHandle[rec.TwitterHandle] = [];
            }
            recipientIdsByHandle[rec.TwitterHandle].push(rec.RECIPIENT_ID);
            emailByRecipientId[rec.RECIPIENT_ID] = rec.Email;
        }
    }
};

// run the app:
_exportEngageDatabase();


function _exportEngageDatabase() {
    console.log('Exporting Engage database for Twitter handles');
    engage.exportListForEach(exportOptions, function(err) {
        if (err) {
            console.log('! Failed to export Engage database: ' + err);
        } else if (twitterHandles.length === 0) {
            console.log('- No Twitter handles found to sweep');
        } else {
            console.log('- Found ' + twitterHandles.length + ' Twitter handles to sweep');
            _createTwitterList();
        }
    });
}

function _createTwitterList() {
    console.log('Creating Twitter list');
    twitter.post('lists/create', {name: "amplify-demo", mode: "private"}, function(err, data, response) {
        if (err) {
            console.log('! Failed to create Twitter list: ' + err);
        } else {
            twitterListId = data.id;
            console.log('- Created Twitter list id ' + twitterListId);
            twitter.post('lists/members/create_all', {list_id: twitterListId, screen_name: twitterHandles.join(',')}, function(err, data, response) {
                if (err) {
                    console.log('! Failed to populate Twitter list: ' + err);
                } else {
                    console.log('- Populated Twitter list with ' + twitterHandles.length + ' handles');
                    _sweepTweets();
                }
            });
        }
    });
}

function _sweepTweets() {
    console.log('Sweeping Twitter list for statuses');
    twitter.get('lists/statuses', {list_id: twitterListId, include_rts: false}, function(err, data, response) {
        if (err) {
            console.log('! Failed to read Twitter list statuses: ' + err);
        } else {
            data.forEach(function(tweet) {
                //console.log('- @' + tweet.user.screen_name + ': ' + tweet.text);
                tweet.text.match(/\S+/g).forEach(function(word) {
                    if (word.charAt(0) === '#') {
                        _processHashtag(tweet.user.screen_name, word.substring(1));
                    }
                });
            });

            _handleAdditions();
        }
    });
}

function _processHashtag(twitterHandle, hashtag) {

    if (!recipientIdsByHandle[twitterHandle]) {
        console.log("! Received tweet from unrecognized handle '" + twitterHandle + "'");
    } else {
        recipientIdsByHandle[twitterHandle].forEach(function(recipientId) {
            var email;
            var contactListId = _getContactListIdForHashtag(hashtag);

            if (contactListId !== null) {
                email = emailByRecipientId[recipientId];
                console.log("- @" + twitterHandle + " tweeted #" + hashtag + " -> add " + email + " (" + recipientId + ") to contact list " + contactListId);

                if (!additions[recipientId]) {
                    additions[recipientId] = [contactListId];
                } else if (additions[recipientId].indexOf(contactListId) === -1) {
                    additions[recipientId].push(contactListId);
                }
            }
        });
    }
}

function _getContactListIdForHashtag(hashtag) {
    switch (hashtag) {
        case 'hike':
        case 'hiking':
        case 'mountain':
            return 4800385;  // contact list id for hiking shoes
        case 'walk':
        case 'walking':
        case 'steps':
            return 4822445;  // contact list id for walking shoes
        case 'beach':
        case 'ocean':
        case 'coast':
            return 4822450;  // contact list id for beach shoes
        case 'running':
        case 'jogging':
        case 'marathon':
            return 4822447;  // contact list id for running shoes
        default:
            return null;
    }
}

function _handleAdditions() {
    var recipientId, email, contactListId;
    console.log('Processing contact list additions');
    for (recipientId in additions) {
        email = emailByRecipientId[recipientId];
        console.log('- For ' + email + ' (' + recipientId + ')');
        additions[recipientId].forEach(_handleAddition.bind(null, email, recipientId));
    }
    _destroyTwitterList();
}

function _handleAddition(email, recipientId, contactListId) {
    console.log('-- Add to contact list ' + contactListId);
    engage.addContactToContactList({contactId: recipientId, contactListId: contactListId}, function(err) {
        if (err) {
            console.log('! Failed to add ' + email + ' (' + recipientId + ') to contact list ' + contactListId);
        }
    });
}

function _destroyTwitterList() {
    console.log('Destroying Twitter list id ' + twitterListId);
    twitter.post('lists/destroy', {list_id: twitterListId}, function(err, data, response) {
        if (err) {
            console.log('! Failed to destroy Twitter list: ' + err);
        } else {
            console.log('- Destroyed Twitter list');
            _finalReport();
        }
    });
}

function _finalReport() {
    console.log('Done');
}

