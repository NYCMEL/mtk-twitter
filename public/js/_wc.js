window.wc    = window.wc    || {};
window.wcAPP = window.wcAPP || "NOT-SET";
window.wcURL = window.wcURL || "";

wc.working   = location.origin != 'http://localhost:3000';
wc.apiURL    = "https://nala-test.com" || "https://nalanetwork.com";
wc.testing   = false;  /* = true SHOULD USE ALL LOCAL CONFIG FILES and others */

// Message storage
wc.emsgs = [
    { id: 1000, text: "Wrong 'Email' or 'Password' combination" },
    { id: 1001, text: "Create user failed" },
    { id: 1002, text: "No questions found for module" },
    { id: 1003, text: "Registeration Failed!" },
    { id: 1004, text: 'You have Successfully completed this set of tests' },
];

wc.emsg = function (id) {
    const msg = this.emsgs.find(m => m.id === id);
    if (!msg) return `Error(${id}): Message not found`;
    return `Error(${id}): ${msg.text}`;
};
// let msg = wc.emsg(1000);

wc.msg = wc.msg || {};
wc.msg.lessonLocked = 'Please finish the current lesson video before moving on to the next lesson.';

/************************************************************
 * CONFIG INACTIVITY TIMER
   SEE wc.login FOR USAGE
************************************************************/
wc.inactivity = {
    idleTime: 2 * 60 * 1000, /* one minute */
    countdown: 40 /* 30 seconds countdown */
};

// FOR WINDOZE
if(typeof(console) === 'undefined') {console = {}}

if (window.wcENV == "prod") {
    wc.log   = console.log   = function () {};
    wc.info  = console.info  = function () {};
    wc.group = console.group = function () {};
}

/////////////////////////////////////////////////////////////////////////////////
//// 
/////////////////////////////////////////////////////////////////////////////////
wc.log = function(...data) {
    return console.log(...data);
}

/////////////////////////////////////////////////////////////////////////////////
//// 
/////////////////////////////////////////////////////////////////////////////////
wc.group = function(...data) {
    return console.group(...data);
}

/////////////////////////////////////////////////////////////////////////////////
//// 
/////////////////////////////////////////////////////////////////////////////////
wc.groupEnd = function(...data) {
    return console.groupEnd(...data);
}

/////////////////////////////////////////////////////////////////////////////////
//// 
/////////////////////////////////////////////////////////////////////////////////
wc.info = function(...data) {
    //wc.logger(...data);
    return console.info(...data);
}

/////////////////////////////////////////////////////////////////////////////////
//// 
/////////////////////////////////////////////////////////////////////////////////
wc.warn = function(...data) {
    return console.warn(...data);
}

/////////////////////////////////////////////////////////////////////////////////
////
/////////////////////////////////////////////////////////////////////////////////
wc.error = function(...data) {
    return console.error(...data);
}

////////////////////////////////////////////////////////////////////////////////////
//// 
////////////////////////////////////////////////////////////////////////////////////
wc.getAttributes = function(node) {
    wc.group("wc.getAttributes", node);

    var i, attributeNodes = node.attributes, length = attributeNodes.length, attrs = {};
    
    for ( i = 0; i < length; i++ ) {
	attrs[attributeNodes[i].name] = attributeNodes[i].value;
    }

    wc.groupEnd();
    return attrs;
}

/////////////////////////////////////////////////////////////////////////////////
//// wc.timeout(function(){
////     alert("A")
//// }, 1000, 1);	 
/////////////////////////////////////////////////////////////////////////////////
wc.timeout = function(func, wait, times) {
    if (typeof times === "undefined") {
	times = 1;
    }

    var interv = function(w, t) {
	return function(){
	    if(typeof t === "undefined" || t-- > 0){
		setTimeout(interv, w);

		try{
		    func.call(null);
		}
		catch(e){
		    t = 0;
		    throw e.toString();
		}
	    }
	};
    }(wait, times);

    setTimeout(interv, wait);
};

/////////////////////////////////////////////////////////////////////////////////
//// wc.fetch("https://nala-test.com/api/curriculum.json");
/////////////////////////////////////////////////////////////////////////////////
wc.fetch = async function (url) {
    wc.log("wc.fetcher", url);

    try {
	const response = await fetch(url);

	if (!response.ok) {
	    throw new Error("HTTP error " + response.status);
	}

	const data = await response.json();
	wc.log("Curriculum JSON:", data);

	return data;
    } catch (error) {
	wc.error("Fetch failed:", error);
	throw error;
    }
};

/////////////////////////////////////////////////////////////////////////////////
//// wc.post - authenticated POST helper
/////////////////////////////////////////////////////////////////////////////////
wc.post = async function (url, data = {}, options = {}) {
    if (!url) {
	wc.error("wc.post: URL is required");
	return Promise.reject("URL is required");
    }

    const token = wcTOKEN;

    const headers = {
	"Content-Type": "application/json",
	...(token ? { "Authorization": "Bearer " + token } : {}),
	...(options.headers || {})
    };

    wc.log("headers:", headers);

    const config = {
	method: "POST",
	headers,
	body: JSON.stringify(data),
	credentials: options.credentials || "same-origin",
	cache: "no-cache"
    };

    try {
	wc.log("wc.post →", url, data);

	const response = await fetch(url, config);

	if (!response.ok) {
	    const errorText = await response.text();
	    wc.error("wc.post failed", response.status, errorText);
	    throw new Error(errorText || response.statusText);
	}

	const contentType = response.headers.get("content-type");

	if (contentType && contentType.indexOf("application/json") !== -1) {
	    return await response.json();
	}

	return await response.text();

    } catch (err) {
	wc.error("wc.post error", err);
	throw err;
    }
};

/////////////////////////////////////////////////////////////////////////////////
//// POST WITH TIMEOUT
/////////////////////////////////////////////////////////////////////////////////
wc.postWithTimeout = (url, data, ms = 8000) => Promise.race([
    wc.post(url, data),
    wc.timeout(ms).then(() => { throw "Request timeout"; })
]);

/////////////////////////////////////////////////////////////////////////////////
//// PubSub
/////////////////////////////////////////////////////////////////////////////////
(function (root, factory){
    'use strict';

    var PubSub = {};

    if (root.PubSub) {
        PubSub = root.PubSub;
        console.warn("PubSub already loaded, using existing version");
    } else {
        root.PubSub = PubSub;
        factory(PubSub);
    }
    // CommonJS and Node.js module support
    if (typeof exports === 'object'){
        if (module !== undefined && module.exports) {
            exports = module.exports = PubSub; // Node.js specific `module.exports`
        }
        exports.PubSub = PubSub; // CommonJS module 1.1.1 spec
        module.exports = exports = PubSub; // CommonJS
    }
    // AMD support
    /* eslint-disable no-undef */
    else if (typeof define === 'function' && define.amd){
        define(function() { return PubSub; });
        /* eslint-enable no-undef */
    }
}(( typeof window === 'object' && window ) || this, function (PubSub){
    'use strict';

    var messages = {},
        lastUid = -1,
        ALL_SUBSCRIBING_MSG = '*';

    function hasKeys(obj){
        var key;

        for (key in obj){
            if ( Object.prototype.hasOwnProperty.call(obj, key) ){
                return true;
            }
        }
        return false;
    }

    /**
     * Returns a function that throws the passed exception, for use as argument for setTimeout
     * @alias throwException
     * @function
     * @param { Object } ex An Error object
     */
    function throwException( ex ){
        return function reThrowException(){
            throw ex;
        };
    }

    function callSubscriberWithDelayedExceptions( subscriber, message, data ){
	//wc.log(message)

        try {
            subscriber( message, data );
        } catch( ex ){
            setTimeout( throwException( ex ), 0);
        }
    }

    function callSubscriberWithImmediateExceptions( subscriber, message, data ){
	//wc.log(message)

        subscriber( message, data );
    }

    function deliverMessage( originalMessage, matchedMessage, data, immediateExceptions ){
        var subscribers = messages[matchedMessage],
            callSubscriber = immediateExceptions ? callSubscriberWithImmediateExceptions : callSubscriberWithDelayedExceptions,
            s;

        if ( !Object.prototype.hasOwnProperty.call( messages, matchedMessage ) ) {
            return;
        }

        for (s in subscribers){
            if ( Object.prototype.hasOwnProperty.call(subscribers, s)){
                callSubscriber( subscribers[s], originalMessage, data );
            }
        }
    }

    function createDeliveryFunction( message, data, immediateExceptions ){
	//wc.log(message)

        return function deliverNamespaced(){
            var topic = String( message ),
                position = topic.lastIndexOf( '.' );

            // deliver the message as it is now
            deliverMessage(message, message, data, immediateExceptions);

            // trim the hierarchy and deliver message to each level
            while( position !== -1 ){
                topic = topic.substr( 0, position );
                position = topic.lastIndexOf('.');
                deliverMessage( message, topic, data, immediateExceptions );
            }

            deliverMessage(message, ALL_SUBSCRIBING_MSG, data, immediateExceptions);
        };
    }

    function hasDirectSubscribersFor( message ) {
	//wc.log(message)

        var topic = String( message ),
            found = Boolean(Object.prototype.hasOwnProperty.call( messages, topic ) && hasKeys(messages[topic]));

        return found;
    }

    function messageHasSubscribers( message ){
	//wc.log(message)

        var topic = String( message ),
            found = hasDirectSubscribersFor(topic) || hasDirectSubscribersFor(ALL_SUBSCRIBING_MSG),
            position = topic.lastIndexOf( '.' );

        while ( !found && position !== -1 ){
            topic = topic.substr( 0, position );
            position = topic.lastIndexOf( '.' );
            found = hasDirectSubscribersFor(topic);
        }

        return found;
    }

    function publish( message, data, sync, immediateExceptions ){
        message = (typeof message === 'symbol') ? message.toString() : message;

	//wc.log(message)

        var deliver = createDeliveryFunction( message, data, immediateExceptions ),
            hasSubscribers = messageHasSubscribers( message );

        if ( !hasSubscribers ){
            return false;
        }

        if ( sync === true ){
            deliver();
        } else {
            setTimeout( deliver, 0 );
        }

        return true;
    }

    PubSub.publish = function( message, data ){
	//wc.log(message)

        return publish( message, data, false, PubSub.immediateExceptions );
    };

    /**
     * Publishes the message synchronously, passing the data to it's subscribers
     * @function
     * @alias publishSync
     * @param { String } message The message to publish
     * @param {} data The data to pass to subscribers
     * @return { Boolean }
     */
    PubSub.publishSync = function( message, data ){
	//wc.log(message)

        return publish( message, data, true, PubSub.immediateExceptions );
    };

    /**
     * Subscribes the passed function to the passed message. Every returned token is unique and should be stored if you need to unsubscribe
     * @function
     * @alias subscribe
     * @param { String } message The message to subscribe to
     * @param { Function } func The function to call when a new message is published
     * @return { String }
     */
    PubSub.subscribe = function( message, func ){
        if ( typeof func !== 'function'){
            return false;
        }

        message = (typeof message === 'symbol') ? message.toString() : message;

        // message is not registered yet
        if ( !Object.prototype.hasOwnProperty.call( messages, message ) ){
            messages[message] = {};
        }

        // forcing token as String, to allow for future expansions without breaking usage
        // and allow for easy use as key names for the 'messages' object
        var token = 'uid_' + String(++lastUid);
        messages[message][token] = func;

        // return token for unsubscribing
        return token;
    };

    PubSub.subscribeAll = function( func ){
        return PubSub.subscribe(ALL_SUBSCRIBING_MSG, func);
    };

    /**
     * Subscribes the passed function to the passed message once
     * @function
     * @alias subscribeOnce
     * @param { String } message The message to subscribe to
     * @param { Function } func The function to call when a new message is published
     * @return { PubSub }
     */
    PubSub.subscribeOnce = function( message, func ){
        var token = PubSub.subscribe( message, function(){
            // before func apply, unsubscribe message
            PubSub.unsubscribe( token );
            func.apply( this, arguments );
        });
        return PubSub;
    };

    /**
     * Clears all subscriptions
     * @function
     * @public
     * @alias clearAllSubscriptions
     */
    PubSub.clearAllSubscriptions = function clearAllSubscriptions(){
        messages = {};
    };

    /**
     * Clear subscriptions by the topic
     * @function
     * @public
     * @alias clearAllSubscriptions
     * @return { int }
     */
    PubSub.clearSubscriptions = function clearSubscriptions(topic){
        var m;
        for (m in messages){
            if (Object.prototype.hasOwnProperty.call(messages, m) && m.indexOf(topic) === 0){
                delete messages[m];
            }
        }
    };

    /**
       Count subscriptions by the topic
       * @function
       * @public
       * @alias countSubscriptions
       * @return { Array }
       */
    PubSub.countSubscriptions = function countSubscriptions(topic){
        var m;
        // eslint-disable-next-line no-unused-vars
        var token;
        var count = 0;
        for (m in messages) {
            if (Object.prototype.hasOwnProperty.call(messages, m) && m.indexOf(topic) === 0) {
                for (token in messages[m]) {
                    count++;
                }
                break;
            }
        }
        return count;
    };


    /**
       Gets subscriptions by the topic
       * @function
       * @public
       * @alias getSubscriptions
       */
    PubSub.getSubscriptions = function getSubscriptions(topic){
        var m;
        var list = [];
        for (m in messages){
            if (Object.prototype.hasOwnProperty.call(messages, m) && m.indexOf(topic) === 0){
                list.push(m);
            }
        }
        return list;
    };

    /**
     * Removes subscriptions
     *
     * - When passed a token, removes a specific subscription.
     *
     * - When passed a function, removes all subscriptions for that function
     *
     * - When passed a topic, removes all subscriptions for that topic (hierarchy)
     * @function
     * @public
     * @alias subscribeOnce
     * @param { String | Function } value A token, function or topic to unsubscribe from
     * @example // Unsubscribing with a token
     * var token = PubSub.subscribe('mytopic', myFunc);
     * PubSub.unsubscribe(token);
     * @example // Unsubscribing with a function
     * PubSub.unsubscribe(myFunc);
     * @example // Unsubscribing from a topic
     * PubSub.unsubscribe('mytopic');
     */
    PubSub.unsubscribe = function(value){
        var descendantTopicExists = function(topic) {
            var m;
            for ( m in messages ){
                if ( Object.prototype.hasOwnProperty.call(messages, m) && m.indexOf(topic) === 0 ){
                    // a descendant of the topic exists:
                    return true;
                }
            }

            return false;
        },
            isTopic    = typeof value === 'string' && ( Object.prototype.hasOwnProperty.call(messages, value) || descendantTopicExists(value) ),
            isToken    = !isTopic && typeof value === 'string',
            isFunction = typeof value === 'function',
            result = false,
            m, message, t;

        if (isTopic){
            PubSub.clearSubscriptions(value);
            return;
        }

        for ( m in messages ){
            if ( Object.prototype.hasOwnProperty.call( messages, m ) ){
                message = messages[m];

                if ( isToken && message[value] ){
                    delete message[value];
                    result = value;
                    // tokens are unique, so we can just stop here
                    break;
                }

                if (isFunction) {
                    for ( t in message ){
                        if (Object.prototype.hasOwnProperty.call(message, t) && message[t] === value){
                            delete message[t];
                            result = true;
                        }
                    }
                }
            }
        }

        return result;
    };
}));

////////////////////////////////////////////////////////////////////////////////////
//// Subscriber: 
////   PubSub.subscribe("MEL", function(msg, data) {
////      wc.log(msg, data);
////   });
//// 
//// Publisher:
////   wc.publish("MEL", {id: 1234, name: "Mel"})
////////////////////////////////////////////////////////////////////////////////////
window.publish = PubSub.publish;
wc.publish     = PubSub.publish;
wc.publishSync = PubSub.publishSync;
wc.subscribe   = PubSub.subscribe;

/////////////////////////////////////////////////////////////////////////////////
//// <wc-include href="..." />
/////////////////////////////////////////////////////////////////////////////////
class Include extends HTMLElement {
    constructor() { super(); }

    connectedCallback() {
        const self = this;
        const href = $(this).attr("href");

        // LOADING PLACEHOLDER INSIDE THIS ELEMENT
        $(self).html("<span class='wc-loading-img'></span>");

        if (!href) return;

        const runLoad = () => {
            self.dispatchEvent(new CustomEvent('include:before-load', {
                detail: { href: href, include: self },
                bubbles: true,
                composed: true
            }));

            $.ajax({
                url: href,
                method: "GET",
                dataType: "html",
                success: function (data) {
                    $(self).html(data); // <-- INJECT INSIDE <wc-include> ITSELF

                    self.dispatchEvent(new CustomEvent('include:loaded', {
                        detail: { href: href, include: self },
                        bubbles: true,
                        composed: true
                    }));
                },
                error: function () {
                    $(self).html("wc-include: Page not found: " + href);
                }
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runLoad, { once: true });
        } else {
            runLoad();
        }
    }
}

window.customElements.define('wc-include', Include);

/////////////////////////////////////////////////////////////////////////////////
//// LOADING CODE
/////////////////////////////////////////////////////////////////////////////////
window.tkloading = {};

/////////////////////////////////////////////////////////////////////////
//// tkloading.show('#xx')
/////////////////////////////////////////////////////////////////////////////
tkloading.show = function(ele = "body", img = null) {
    wc.log("tkloading.show:", ele);
    
    $(ele).css("position","relative");
    $(ele).append("<div class='tkloading'></div>");
    
    if (img) {
	$(".tkloading").css({
	    "background-image": `url(${img})`,
	    "background-repeat": "no-repeat"
	});
    }

    if (ele == "body") {
	$(ele + " .tkloading").css("position", "fixed");
    } else {
	$(ele + " .tkloading").css("position", "absolute");
    }
    
    $(ele + " .tkloading").show();
};

/////////////////////////////////////////////////////////////////////////
//// tkloading.hide('#xx')
/////////////////////////////////////////////////////////////////////////////
tkloading.hide = function(ele = "body") {
    wc.group("tkloading.hide:", ele);

    $(ele + " .tkloading").remove();
};

/////////////////////////////////////////////////////////////////////////////////
//// Set a cookie
/////////////////////////////////////////////////////////////////////////////////
wc.setCookie = function(name, value, days = null, path = '/', domain = null, secure = false, sameSite = 'Lax') {
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    
    if (days) {
	const date = new Date();
	date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
	cookie += `; expires=${date.toUTCString()}`;
    }
    
    cookie += `; path=${path}`;
    
    if (domain) {
	cookie += `; domain=${domain}`;
    }
    
    if (secure) {
	cookie += '; secure';
    }
    
    if (sameSite) {
	cookie += `; SameSite=${sameSite}`;
    }
    
    document.cookie = cookie;
}

/////////////////////////////////////////////////////////////////////////////////
//// Get a cookie value by name
/////////////////////////////////////////////////////////////////////////////////
wc.getCookie = function(name) {
    const nameEQ = encodeURIComponent(name) + '=';
    const cookies = document.cookie.split(';');
    
    for (let i = 0; i < cookies.length; i++) {
	let cookie = cookies[i].trim();
	if (cookie.indexOf(nameEQ) === 0) {
	    return decodeURIComponent(cookie.substring(nameEQ.length));
	}
    }
    
    return null;
}

/////////////////////////////////////////////////////////////////////////////////
//// Delete a cookie
/////////////////////////////////////////////////////////////////////////////////
wc.deleteCookie = function(name, path = '/', domain = null) {
    wc.setCookie(name, '', -1, path, domain);
}

/////////////////////////////////////////////////////////////////////////////////
//// Check if a cookie exists
/////////////////////////////////////////////////////////////////////////////////
wc.cookieExists = function(name) {
    return wc.getCookie(name) !== null;
}

/////////////////////////////////////////////////////////////////////////////////
//// Get all cookies as an object
/////////////////////////////////////////////////////////////////////////////////
wc.getAllCookies = function() {
    const cookies = {};
    const cookieArray = document.cookie.split(';');
    
    for (let i = 0; i < cookieArray.length; i++) {
	const cookie = cookieArray[i].trim();
	const [name, value] = cookie.split('=');
	if (name) {
	    cookies[decodeURIComponent(name)] = decodeURIComponent(value || '');
	}
    }
    
    return cookies;
}

/////////////////////////////////////////////////////////////////////////////////
//// Delete all cookies
/////////////////////////////////////////////////////////////////////////////////
wc.deleteAllCookies = function(path = '/', domain = null) {
    const cookies = wc.getAllCookies();
    for (let name in cookies) {
	wc.deleteCookie(name, path, domain);
    }
}

/////////////////////////////////////////////////////////////////////////////////
//// Set a cookie with JSON value
/////////////////////////////////////////////////////////////////////////////////
wc.setCookieJSON = function(name, value, days = null, path = '/') {
    try {
	const jsonValue = JSON.stringify(value);
	wc.setCookie(name, jsonValue, days, path);
    } catch (error) {
	console.error('Error stringifying JSON for cookie:', error);
    }
}

/////////////////////////////////////////////////////////////////////////////////
//// Get a cookie and parse it as JSON
/////////////////////////////////////////////////////////////////////////////////
wc.getCookieJSON = function(name) {
    const value = wc.getCookie(name);
    if (!value) return null;
    
    try {
	return JSON.parse(value);
    } catch (error) {
	console.error('Error parsing JSON from cookie:', error);
	return null;
    }
}

/////////////////////////////////////////////////////////////////////////////////
//// Update a cookie value (merge with existing if JSON)
/////////////////////////////////////////////////////////////////////////////////
wc.updateCookie = function(name, updates, days = null, isJSON = null) {
    const existing = wc.getCookie(name);
    
    if (existing && (isJSON === true || (isJSON === null && existing.startsWith('{')))) {
	const current = wc.getCookieJSON(name) || {};
	const merged = { ...current, ...updates };
	wc.setCookieJSON(name, merged, days);
    } else {
	wc.setCookie(name, updates, days);
    }
}

/////////////////////////////////////////////////////////////////////////////////
//// Set a session cookie (expires when browser closes)
/////////////////////////////////////////////////////////////////////////////////
wc.setSessionCookie = function(name, value, path = '/') {
    wc.setCookie(name, value, null, path);
}

/////////////////////////////////////////////////////////////////////////////////
//// Set a secure cookie (HTTPS only)
/////////////////////////////////////////////////////////////////////////////////
wc.setSecureCookie = function(name, value, days = 7, sameSite = 'Strict') {
    wc.setCookie(name, value, days, '/', null, true, sameSite);
}

/////////////////////////////////////////////////////////////////////////////////
//// Check if cookies are enabled in the browser
/////////////////////////////////////////////////////////////////////////////////
wc.areCookiesEnabled = function() {
    const testCookie = '__test_cookie__';
    wc.setCookie(testCookie, 'test', 1);
    const enabled = wc.cookieExists(testCookie);
    if (enabled) {
	wc.deleteCookie(testCookie);
    }
    return enabled;
}

/////////////////////////////////////////////////////////////////////////////////
//// Count total number of cookies
/////////////////////////////////////////////////////////////////////////////////
wc.countCookies = function() {
    if (!document.cookie) return 0;
    return document.cookie.split(';').filter(c => c.trim()).length;
}

/////////////////////////////////////////////////////////////////////////////////
//// Get cookie size in bytes
/////////////////////////////////////////////////////////////////////////////////
wc.getCookieSize = function(name) {
    const value = wc.getCookie(name);
    if (!value) return 0;
    return new Blob([`${name}=${value}`]).size;
}

/////////////////////////////////////////////////////////////////////////////////
//// Get total size of all cookies in bytes
/////////////////////////////////////////////////////////////////////////////////
wc.getTotalCookieSize = function() {
    return new Blob([document.cookie]).size;
}

/////////////////////////////////////////////////////////////////////////////////
//// List all cookie names
/////////////////////////////////////////////////////////////////////////////////
wc.listCookieNames = function() {
    const cookies = wc.getAllCookies();
    return Object.keys(cookies);
}

/////////////////////////////////////////////////////////////////////////////////
//// Check if a cookie value matches
/////////////////////////////////////////////////////////////////////////////////
wc.cookieValueMatches = function(name, value) {
    return wc.getCookie(name) === value;
}

/////////////////////////////////////////////////////////////////////////////////
//// Rename a cookie (copy to new name and delete old)
/////////////////////////////////////////////////////////////////////////////////
wc.renameCookie = function(oldName, newName, days = null) {
    const value = wc.getCookie(oldName);
    if (value !== null) {
	wc.setCookie(newName, value, days);
	wc.deleteCookie(oldName);
	return true;
    }
    return false;
}

/////////////////////////////////////////////////////////////////////////////////
//// Copy a cookie to a new name
/////////////////////////////////////////////////////////////////////////////////
wc.copyCookie = function(sourceName, targetName, days = null) {
    const value = wc.getCookie(sourceName);
    if (value !== null) {
	wc.setCookie(targetName, value, days);
	return true;
    }
    return false;
}

/////////////////////////////////////////////////////////////////////////////////
//// Set multiple cookies at once
/////////////////////////////////////////////////////////////////////////////////
wc.setMultipleCookies = function(cookiesObj, days = null) {
    for (let name in cookiesObj) {
	const config = cookiesObj[name];
	if (typeof config === 'object' && config.value !== undefined) {
	    wc.setCookie(name, config.value, config.days || days, config.path, config.domain, config.secure, config.sameSite);
	} else {
	    wc.setCookie(name, config, days);
	}
    }
}

/////////////////////////////////////////////////////////////////////////////////
//// Get multiple cookies at once
/////////////////////////////////////////////////////////////////////////////////
wc.getMultipleCookies = function(names) {
    const result = {};
    names.forEach(name => {
	result[name] = wc.getCookie(name);
    });
    return result;
}

/////////////////////////////////////////////////////////////////////////////////
//// Delete multiple cookies at once
/////////////////////////////////////////////////////////////////////////////////
wc.deleteMultipleCookies = function(names, path = '/') {
    names.forEach(name => {
	wc.deleteCookie(name, path);
    });
}

/////////////////////////////////////////////////////////////////////////////////
//// Search for cookies by name pattern
/////////////////////////////////////////////////////////////////////////////////
wc.findCookies = function(pattern) {
    const allCookies = wc.getAllCookies();
    const matches = {};
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    
    for (let name in allCookies) {
	if (regex.test(name)) {
	    matches[name] = allCookies[name];
	}
    }
    
    return matches;
}

/////////////////////////////////////////////////////////////////////////////////
//// Delete cookies matching a pattern
/////////////////////////////////////////////////////////////////////////////////
wc.deleteCookiesByPattern = function(pattern, path = '/') {
    const matches = wc.findCookies(pattern);
    for (let name in matches) {
	wc.deleteCookie(name, path);
    }
}

/////////////////////////////////////////////////////////////////////////////////
//// Check if cookie storage is available and under limit
/////////////////////////////////////////////////////////////////////////////////
wc.isCookieStorageAvailable = function() {
    const maxSize = 4096; // Typical cookie limit per domain
    return wc.getTotalCookieSize() < maxSize;
}

/////////////////////////////////////////////////////////////////////////////////
//// Console log utility
/////////////////////////////////////////////////////////////////////////////////
wc.log = function(...data) {
    return console.log(...data);
}

// Make wc globally available
window.wc = wc;

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = wc;
}

/////////////////////////////////////////////////////////////////////////////////
//// LOGIN
/////////////////////////////////////////////////////////////////////////////////
wc.login = async function (email, passwd) {
    wc.log('login');

    try {
        const res = await fetch(wc.apiURL + '/api/login.php', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: passwd
            })
        });

        // Read response safely (handles PHP/HTML error pages that are not JSON)
        const text = await res.text();
        let data = null;

        try {
            data = JSON.parse(text);
        } catch (e) {
            wc.error("login.php returned non-JSON:", text);
            throw new Error("Server returned non-JSON from login.php (see console). First 300 chars: " + text.slice(0, 300));
        }

        if (!res.ok) {
            // If backend provides an error message, show it; else show a generic one
            const msg = (data && (data.error || data.message)) ? (data.error || data.message) : 'combination of email and password';
            //alert('1) Login Failed: ' + msg);

	    MTKMsgs.show({
		type: 'error',
		icon: 'error',
		message: wc.emsg(1000),
		closable: false,
		timer: 7
	    });	    

            return false;
        }

        // GET SESSION
	wc.getSession(function (loggedIn, session, err) {
	    if (err) return;

	    if (loggedIn) {
		// START TRACKING when logged in
		wc.startInactivityTracking();

		$("#uname").html(wc.session.user.name);
	    } else {
		wc.log('IS NOT LOGGED IN');
		wc.pages.show('home');
	    };
	});
	
        return true;
    } catch (err) {
        wc.error("Login failed:", err);
        alert("2) Login failed: " + (err && err.message ? err.message : String(err)));
        return false;
    } finally {
    }
};

/////////////////////////////////////////////////////////////////////////////////
//// LOGOUT
/////////////////////////////////////////////////////////////////////////////////
wc.logout = async function () {
    wc.log('logout');

    wc.session = wc.user = null;

    // REMOVE USER NAME
    wc.deleteCookie("user");

    try {
        const res = await fetch(wc.apiURL + '/api/logout.php', {
            method: 'POST',
            credentials: 'include'
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || 'Logout failed');
        }

        // reset
        wc.currentUser = null;

        wc.log('logged out', data);
        return true;
    } catch (err) {
        wc.error('doLogout failed:', err);
        throw err;
    } finally {
    }
};

/////////////////////////////////////////////////////////////////////////////////
// wc.getSession(function (loggedIn, session, err) {
//     if (err) return;
//    
//     if (loggedIn) {
//         wc.log('User is logged in');
//     } else {
//         wc.log('User is logged out');
//     }
// });
/////////////////////////////////////////////////////////////////////////////////
wc.getSession = function (callback) {
    return fetch(wc.apiURL + '/api/me.php', {
        credentials: 'include'
    }).then(res => res.json()).then(data => {
	wc.session = data; /* SAVE THIS FOR USE EVERYWHERE */
	
	wc.log("wc.getSession:", data);

        if (typeof callback === 'function') {
            callback(data.logged_in, data);
        }

        return data.logged_in;
    })
	.catch(err => {
            wc.error('getSession failed', err);

            if (typeof callback === 'function') {
		callback(false, null, err);
            }

            throw err;
	});
};

/************************************************************
 * INACTIVITY TIMER
 ************************************************************/
// DEFAULTS IN app.js FILE

/************************************************************
 * INACTIVITY LOGIC
 ************************************************************/
wc.resetInactivity = function () {
    clearTimeout(wc.inactivity.idleTimer);

    wc.inactivity.idleTimer = setTimeout(
        wc.showInactivityModal,
        wc.inactivity.idleTime
    );
};

wc.showInactivityModal = function () {
    let seconds = wc.inactivity.countdown;

    if (document.getElementById('wc-idle-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'wc-idle-modal';

    modal.innerHTML = `
        <div class="wc-md-backdrop"></div>
        <div class="wc-md-dialog">
            <h2>Are you still there?</h2>
            <p>
                You will be logged out in
                <strong id="wc-idle-seconds">${seconds}</strong>
                seconds.
            </p>
            <div class="wc-md-actions">
                <button class="wc-md-btn wc-md-btn-text" id="wc-idle-no">
                    No
                </button>
                <button class="wc-md-btn wc-md-btn-primary" id="wc-idle-yes">
                    Yes
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    wc.injectMaterialStyles();

    // Countdown
    wc.inactivity.countdownTimer = setInterval(() => {
        seconds--;
        document.getElementById('wc-idle-seconds').textContent = seconds;

        if (seconds <= 0) {
            wc.closeIdleModal();
            wc.publish('mtk-header-logout');
        }
    }, 1000);

    // Buttons
    document.getElementById('wc-idle-yes').onclick = function () {
        wc.closeIdleModal();
        wc.resetInactivity();
    };

    document.getElementById('wc-idle-no').onclick = function () {
        wc.closeIdleModal();
        wc.publish('mtk-header-logout');
    };
};


wc.closeIdleModal = function () {
    clearInterval(wc.inactivity.countdownTimer);
    wc.inactivity.countdownTimer = null;

    const modal = document.getElementById('wc-idle-modal');
    if (modal) modal.remove();
};

/************************************************************
 * START / STOP
 ************************************************************/
wc.startInactivityTracking = function () {
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
        .forEach(evt =>
            window.addEventListener(evt, wc.resetInactivity, { passive: true })
        );

    wc.resetInactivity();
};

wc.stopInactivityTracking = function () {
    clearTimeout(wc.inactivity.idleTimer);
    wc.closeIdleModal();
};


/************************************************************
 * MATERIAL DESIGN–LIKE STYLES (Injected Once)
 ************************************************************/
wc.injectMaterialStyles = function () {
    if (document.getElementById('wc-md-styles')) return;

    const style = document.createElement('style');
    style.id = 'wc-md-styles';
    style.textContent = `
        .wc-md-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 9998;
        }

        .wc-md-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            border-radius: 8px;
            padding: 24px;
            min-width: 320px;
            box-shadow:
                0 5px 5px -3px rgba(0,0,0,.2),
                0 8px 10px 1px rgba(0,0,0,.14),
                0 3px 14px 2px rgba(0,0,0,.12);
            z-index: 9999;
            font-family: Roboto, Arial, sans-serif;
        }

        .wc-md-dialog h2 {
            margin: 0 0 12px;
            font-size: 20px;
            font-weight: 500;
        }

        .wc-md-dialog p {
            margin: 0 0 20px;
            color: #444;
        }

        .wc-md-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .wc-md-btn {
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            background: none;
            text-transform: uppercase;
        }

        .wc-md-btn-text {
            color: #6200ee;
        }

        .wc-md-btn-primary {
            background: #6200ee;
            color: #fff;
            box-shadow: 0 3px 1px -2px rgba(0,0,0,.2),
                        0 2px 2px 0 rgba(0,0,0,.14),
                        0 1px 5px 0 rgba(0,0,0,.12);
        }

        .wc-md-btn-primary:hover {
            background: #5300d6;
        }
    `;

    document.head.appendChild(style);
};

/////////////////////////////////////////////////////////////////////////////////
//// Quiz API
/////////////////////////////////////////////////////////////////////////////////
wc.getQuiz = function (moduleId, callback, count) {
    // Usage:
    //   wc.getQuiz("module_0_0", function(err, data){ ... });
    //   wc.getQuiz("module_0_0", function(err, data){ ... }, 10);
    //
    // moduleId must match the quiz_questions.module_id values (e.g., "M1", "M2"...).
    if (typeof moduleId !== "string" || !moduleId.trim()) {
        const err = new Error("Missing moduleId");
        if (typeof callback === "function") callback(err, null);
        return;
    }

    const qs = new URLSearchParams();
    qs.set("module_id", moduleId.trim());
    if (Number.isFinite(count) && count > 0) qs.set("count", String(Math.min(50, Math.floor(count))));

    // https://nala-test.com/api/getQuiz.php?module_id=M2
    fetch(wc.apiURL + "/api/getQuiz.php?" + qs.toString(), {
        method: "GET",
        credentials: "include"
    }).then(async (res) => {
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) {
            throw new Error("getQuiz returned non-JSON. First 300 chars: " + text.slice(0, 300));
        }
        if (!res.ok || (data && data.ok === false)) {
            const msg = (data && (data.error || data.message)) ? (data.error || data.message) : ("HTTP " + res.status);
            const err = new Error(msg);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }).then(data => {
        wc.log("Quiz data:", data);
        if (typeof callback === "function") callback(null, data);
    }).catch(err => {
        wc.error("getQuiz error:", err);
        if (typeof callback === "function") callback(err, null);
    });
};


/////////////////////////////////////////////////////////////////////////////////
//// ASSUME DIFFERENT USER TYPES
/////////////////////////////////////////////////////////////////////////////////
wc.setUser = function (opts, callback) {
    // opts: { role: "registered|free|admin", module: "M1", lesson: 0 }
    opts = opts || {};
    const role = opts.role || null;
    const module = opts.module || null;
    let lesson = (opts.lesson === 0 || opts.lesson) ? opts.lesson : null;

    // If module is provided but lesson is not, default lesson to 0 (per requirement)
    if (module && (lesson === null || lesson === undefined)) lesson = 0;

    const qs = new URLSearchParams();
    if (role) qs.set("role", role);
    if (module) qs.set("module", module);
    if (lesson !== null && lesson !== undefined) qs.set("lesson", String(lesson));

    fetch(wc.apiURL + "/api/setUser.php?" + qs.toString(), {
        method: "GET",
        credentials: "include"
    }).then(res => {
        if (!res.ok) {
            throw new Error("Failed to set user");
        }
        return res.json();
    }).then(data => {
        wc.log("setUser data:", data);

        if (typeof callback === "function") {
            callback(null, data);
        }
    }).catch(err => {
        wc.error("setUser error:", err);

        if (typeof callback === "function") {
            callback(err, null);
        }
    });
};




/************************************************************
 * LESSON COMPLETE API
 ************************************************************/

wc.lessonComplete = function (clickedLessonNo, currentLessonNo, callback) {
    // FIXED:
    // Only advance progress when the user clicks the LATEST unlocked lesson:
    // clickedLessonNo === currentLessonNo (which should match users.current_lesson in DB).
    //
    // New recommended signature:
    //   wc.lessonComplete(clickedLessonNo, currentLessonNo, callback)
    //
    // Backwards compatible:
    //   wc.lessonComplete(callback) => NO-OP (prevents unintended advancement on any click)

    if (typeof clickedLessonNo === "function") {
        wc.warn("wc.lessonComplete called without lesson numbers - NO-OP to prevent unintended advancement.");
        try { clickedLessonNo(null, { ok: true, advanced: false, updated: false, reason: "client_guard_no_args" }); } catch (e) {}
        return;
    }

    if (typeof currentLessonNo === "function") {
        callback = currentLessonNo;
        currentLessonNo = null;
    }

    const ln = Number(clickedLessonNo);
    const cur = (currentLessonNo === null || currentLessonNo === undefined) ? null : Number(currentLessonNo);

    if (!Number.isFinite(ln) || ln < 0) {
        const err = new Error("wc.lessonComplete: invalid clickedLessonNo");
        wc.error(err);
        if (typeof callback === "function") callback(err, null);
        return;
    }

    // If we don't know the current lesson, refuse to advance.
    if (cur === null || !Number.isFinite(cur) || cur < 0) {
        wc.warn("wc.lessonComplete missing currentLessonNo - NO-OP to prevent unintended advancement.", { clickedLessonNo: ln });
        if (typeof callback === "function") callback(null, { ok: true, advanced: false, updated: false, reason: "client_guard_missing_current" });
        return;
    }

    // Only advance if they clicked the latest lesson
    if (ln !== cur) {
        if (typeof callback === "function") callback(null, { ok: true, advanced: false, updated: false, reason: "client_guard_not_latest", current_lesson: cur });
        return;
    }

    // Call the correct endpoint
    fetch(wc.apiURL + "/api/lessonComplete.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_no: ln, expected_current: cur })
    }).then(async (res) => {
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) {
            throw new Error("lessonComplete returned non-JSON. First 300 chars: " + text.slice(0, 300));
        }
        if (!res.ok || (data && data.ok === false)) {
            const msg = (data && (data.error || data.message)) ? (data.error || data.message) : ("HTTP " + res.status);
            const err = new Error(msg);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }).then(data => {
        if (typeof callback === "function") callback(null, data);
    }).catch(err => {
        wc.error("lessonComplete error:", err);
        if (typeof callback === "function") callback(err, null);
    });
};

/************************************************************
 * SET CURRENT LESSON API
 ************************************************************/
wc.setCurrentLesson = function(role, module, lesson) {
    fetch(wc.apiURL + '/api/setCurrentLesson.php?role='+ role + '&module=' + module + '&lesson=' + lesson, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	credentials: 'include',
	body: JSON.stringify({ lesson })
    }).then(r => r.json())
};

/************************************************************
 * SET CURRENT LESSON API
 ************************************************************/
wc.setDasbboardProgress = function(percentage) {
    mtkDashboard.updateProgress({ percentage:  percentage});
}

/************************************************************
 * SUBMIT QUIZ API
 * answersMap format: { "29":"a", "37":"c", ... }
 ************************************************************/
wc.submitQuiz = function (quizSessionId, moduleId, answersMap, callback) {
    const payload = {
        quiz_session_id: quizSessionId,
        module_id: moduleId,
        answers: answersMap || {}
    };

    fetch(wc.apiURL + "/api/submitQuiz.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(res => {
        if (!res.ok) {
            throw new Error("Failed to submit quiz");
        }
        return res.json();
    }).then(data => {
        wc.log("submitQuiz data:", data);

        if (typeof callback === "function") {
            callback(null, data);
        }
    }).catch(err => {
        wc.error("submitQuiz error:", err);

        if (typeof callback === "function") {
            callback(err, null);
        }
    });
};
/************************************************************
 * FIX / UNFIX FOOTER ON SHORT PAGES
 ************************************************************/
wc.fixFooter = function() {
    const footer = document.getElementById("page-footer");
    if (!footer) return;

    wc._adjustFooter = function() {
        const docHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;

        if (docHeight <= viewportHeight) {
            footer.style.position = "fixed";
            footer.style.bottom = "0";
            footer.style.left = "0";
            footer.style.width = "100%";
        } else {
            footer.style.position = "static";
            footer.style.removeProperty("bottom");
            footer.style.removeProperty("left");
            footer.style.removeProperty("width");
        }
    };

    window.removeEventListener("load", wc._adjustFooter);
    window.removeEventListener("resize", wc._adjustFooter);
    window.addEventListener("load", wc._adjustFooter);
    window.addEventListener("resize", wc._adjustFooter);

    setTimeout(wc._adjustFooter, 50);
};

/************************************************************
 * REMOVE FIXED FOOTER BEHAVIOR
 ************************************************************/
wc.unfixFooter = function() {
    const footer = document.getElementById("page-footer");
    if (!footer) return;

    if (wc._adjustFooter) {
        window.removeEventListener("load", wc._adjustFooter);
        window.removeEventListener("resize", wc._adjustFooter);
    }

    footer.style.removeProperty("position");
    footer.style.removeProperty("bottom");
    footer.style.removeProperty("left");
    footer.style.removeProperty("width");
};

/************************************************************
 * fix footer to bottom
 ************************************************************/
wc.fixFooter = function() {
    const footer = document.getElementById("page-footer");
    if (!footer) return;

    function adjustFooter() {
	const docHeight = document.documentElement.scrollHeight;
	const viewportHeight = window.innerHeight;

	if (docHeight <= viewportHeight) {
	    footer.style.position = "fixed";
	    footer.style.bottom = "0";
	    footer.style.left = "0";
	    footer.style.width = "100%";
	} else {
	    footer.style.position = "static";
	}
    }

    // Run after layout is truly ready
    window.addEventListener("load", adjustFooter);
    window.addEventListener("resize", adjustFooter);

    // Extra safety: re-run after fonts/images
    setTimeout(adjustFooter, 50);
}

/************************************************************
 * fix footer to bottom
 ************************************************************/
/************************************************************
 * fix footer to bottom
 ************************************************************/
wc.fixFooter = function() {
    const footer = document.getElementById("page-footer");
    if (!footer) return;

    wc._adjustFooter = function() {
        const docHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;

        if (docHeight <= viewportHeight) {
            footer.style.position = "fixed";
            footer.style.bottom = "0";
            footer.style.left = "0";
            footer.style.width = "100%";
        } else {
            footer.style.position = "static";
        }
    };

    window.addEventListener("load", wc._adjustFooter);
    window.addEventListener("resize", wc._adjustFooter);

    setTimeout(wc._adjustFooter, 50);
};


/************************************************************
 * REMOVE FIXED FOOTER BEHAVIOR
 ************************************************************/
wc.unfixFooter = function() {
    const footer = document.getElementById("page-footer");
    if (!footer) return;

    if (wc._adjustFooter) {
        window.removeEventListener("load", wc._adjustFooter);
        window.removeEventListener("resize", wc._adjustFooter);
    }

    footer.style.removeProperty("position");
    footer.style.removeProperty("bottom");
    footer.style.removeProperty("left");
    footer.style.removeProperty("width");
};

/************************************************************
 * LOAD A SCRIPT
 ************************************************************/
wc.loadScript = function (src) {
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    document.body.appendChild(s);
}

/************************************************************
 * LOAD A SCRIPT as a component
 ************************************************************/
class MtkScript extends HTMLElement {
    connectedCallback() {
	// Determine script URL
	let src = this.getAttribute("src");
	if (!src) {
	    console.warn("<mtk-script> missing 'src' attribute");
	    return;
	}

	// Optionally replace ".js" with ".{wcLAN}.js" if you follow that convention
	if (!src.includes(`.${wcLAN}.js`) && !src.endsWith(`.${wcLAN}.js`)) {
	    const parts = src.split(".js");
	    src = `${parts[0]}.${wcLAN}.js`;
	}

	// Dynamically load the script
	const script = document.createElement("script");
	script.src = src;
	script.async = false; // preserve execution order
	document.body.appendChild(script);

	console.log(script.src);
    }
}

// Define the custom element
customElements.define("mtk-script", MtkScript);
