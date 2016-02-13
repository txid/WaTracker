var settings = {
    recordQ: true,
}

chrome.app.runtime.onLaunched.addListener(function() {
    chrome.app.window.create('launcher.html', {
        'outerBounds': {
            'width': 900,
            'height': 750
        }
    });
});

chrome.runtime.onConnect.addListener(function(port) {
    if (!settings.recordQ)
        return;

    console.assert(port.name == "presenceUpdates");
    console.log('Recording began');

    chrome.power.requestKeepAwake('system');

    rdb = openDatabase();

    ///// Processing presence updates /////

    function time() {
        return parseInt((new Date()).getTime() / 1000);
    }

    var t = time();
    var recordingTime = {
        startTime: t,
        endTime: t
    };

    port.onMessage.addListener(function(presenceMsg) {
        recordingTime.endTime = time();

        rdb.get(function(db) {
            var transaction = db.transaction(['recordingTimes', 'presenceUpdates'], 'readwrite');
            transaction.objectStore('recordingTimes')
                .put(recordingTime);
            transaction.objectStore('presenceUpdates')
                .add(presenceMsg);

            console.log(presenceMsg);
        });
    });

    ///// Closing the database /////

    port.onDisconnect.addListener(function() {
        recordingTime.endTime = time();

        rdb.get(function(db) {
            db.transaction('recordingTimes', 'readwrite')
                .objectStore('recordingTimes')
                .put(recordingTime);
            db.close();

            console.log('Recording ended');
        });

        chrome.power.releaseKeepAwake();
    });
});

chrome.runtime.onMessage.addListener(function(message) {
    console.assert(message.type == 'wa_contacts');
    var contacts = message.value;

    console.log('Recieved contact list:', contacts);

    openDatabase().get(function(db) {
        var store = db.transaction('contacts', 'readwrite')
            .objectStore('contacts');

        for (var i = 0; i < contacts.length; i++) {
            store.put(contacts[i]);
        }
    });
});

function openDatabase() {
    var rdb = new SmartDBConnection('OnlineTimes', 1);
    rdb.onupgradedatabase = function upgradeDatabase(db, oldVersion) {
        console.log('Upgrading database from version', oldVersion);
        db.createObjectStore('contacts', {'keyPath': 'id'});
        db.createObjectStore('recordingTimes', {'keyPath': 'startTime'});
        db.createObjectStore('presenceUpdates', {'autoIncrement': true});
    };
    return rdb;
}

function SmartDBConnection(name, version) {
    this.onupgradedatabase = null;

    var db = null;
    var waitingRequests = [];

    this.get = function(callback) {
        if (db) {
            callback(db);
        }
        else {
            waitingRequests.push(callback);
        }
    };

    {
        var request = window.indexedDB.open(name, version);
        var self = this;

        request.onupgradeneeded = function(event) {
            db = event.target.result;
            self.onupgradedatabase(db, event.oldVersion);
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            waitingRequests.forEach(function(request) {
                request(db);
            });
            waitingRequests = null;
        };
    }
}

function getObjectStore(storeName, callback) {
    openDatabase().get(function(db) {
        var entries = [];

        db.transaction(storeName)
            .objectStore(storeName)
            .openCursor()
            .onsuccess = function(event) {
            var cursor = event.target.result;

            if (cursor) {
                entries.push(cursor.value);
                cursor.continue();
            }
            else {
                callback(entries);
            }
        };
    });
}

function getAllEntries(callback) {
    getObjectStore('presenceUpdates', callback);
}

function getRecordingTimes(callback) {
    getObjectStore('recordingTimes', callback);
}

function getContacts(callback) {
    getObjectStore('contacts', callback);
}