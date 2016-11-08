/* globals cordova */

if (!Accounts.saml) {
	Accounts.saml = {};
}

// Override the standard logout behaviour.
//
// If we find a samlProvider in our session, and we are using single
// logout we will initiate logout from rocketchat via saml.

var MeteorLogout = Meteor.logout;

Meteor.logout = function() {
	var provider = Session.get('samlProvider'),
			usingSingleLogout = Session.get('usingSingleLogout');
	if (provider) {
		Session.set('samlProvider', false);
		Session.set('usingSingleLogout', false);
		if (usingSingleLogout) {
			return Meteor.logoutWithSaml({ provider: provider });
		}
	}
	return MeteorLogout.apply(Meteor, arguments);
};

var openCenteredPopup = function(url, width, height) {
	var newwindow;

	if (typeof cordova !== 'undefined' && typeof cordova.InAppBrowser !== 'undefined') {
		newwindow = cordova.InAppBrowser.open(url, '_blank');
		newwindow.closed = false;

		var intervalId = setInterval(function() {
			newwindow.executeScript({
				'code': 'document.getElementsByTagName("script")[0].textContent'
			}, function(data) {
				if (data && data.length > 0 && data[0] === 'window.close()') {
					newwindow.close();
					newwindow.closed = true;
				}
			});
		}, 100);

		newwindow.addEventListener('exit', function() {
			clearInterval(intervalId);
		});
	} else {
		var screenX = typeof window.screenX !== 'undefined' ? window.screenX : window.screenLeft;
		var screenY = typeof window.screenY !== 'undefined' ? window.screenY : window.screenTop;
		var outerWidth = typeof window.outerWidth !== 'undefined' ? window.outerWidth : document.body.clientWidth;
		var outerHeight = typeof window.outerHeight !== 'undefined' ? window.outerHeight : (document.body.clientHeight - 22);
		// XXX what is the 22?

		// Use `outerWidth - width` and `outerHeight - height` for help in
		// positioning the popup centered relative to the current window
		var left = screenX + (outerWidth - width) / 2;
		var top = screenY + (outerHeight - height) / 2;
		var features = ('width=' + width + ',height=' + height +
			',left=' + left + ',top=' + top + ',scrollbars=yes');

		newwindow = window.open(url, 'Login', features);
		if (newwindow.focus) {
			newwindow.focus();
		}
	}
	return newwindow;
};

Accounts.saml.initiateLogin = function(options, callback, dimensions) {
	// default dimensions that worked well for facebook and google
	var popup = openCenteredPopup(
		Meteor.absoluteUrl('_saml/authorize/' + options.provider + '/' + options.credentialToken), (dimensions && dimensions.width) || 650, (dimensions && dimensions.height) || 500);

	var checkPopupOpen = setInterval(function() {
		var popupClosed;
		try {
			// Fix for #328 - added a second test criteria (popup.closed === undefined)
			// to humour this Android quirk:
			// http://code.google.com/p/android/issues/detail?id=21061
			popupClosed = popup.closed || popup.closed === undefined;
		} catch (e) {
			// For some unknown reason, IE9 (and others?) sometimes (when
			// the popup closes too quickly?) throws 'SCRIPT16386: No such
			// interface supported' when trying to read 'popup.closed'. Try
			// again in 100ms.
			return;
		}

		if (popupClosed) {
			clearInterval(checkPopupOpen);
			callback(options.credentialToken);
		}
	}, 100);
};


Meteor.loginWithSaml = function(options, callback) {
	Session.set('samlProvider', options.provider);
	options = options || {};
	var credentialToken = Random.id();
	options.credentialToken = credentialToken;

	Accounts.saml.initiateLogin(options, function(/*error, result*/) {
		Accounts.callLoginMethod({
			methodArguments: [{
				saml: true,
				credentialToken: credentialToken
			}],
			userCallback: callback
		});
	});

	// Record if we are doing single logout with the idp.

	Meteor.call('usingSingleLogout', options.provider, function (err, res) {
		if (! err) {
			Session.set('usingSingleLogout', res);
		}
		console.log('usingSingleLogout', res);
	});
};

Meteor.logoutWithSaml = function(options/*, callback*/) {
	//Accounts.saml.idpInitiatedSLO(options, callback);
	Meteor.call('samlLogout', options.provider, function(err, result) {
		console.log('LOC ' + result);
		// A nasty bounce: 'result' has the SAML LogoutRequest but we need a proper 302 to redirected from the server.
		//window.location.replace(Meteor.absoluteUrl('_saml/sloRedirect/' + options.provider + '/?redirect='+result));
		window.location.replace(Meteor.absoluteUrl('_saml/sloRedirect/' + options.provider + '/?redirect=' + encodeURIComponent(result)));
	});
};
