'use strict';

/*global ActiveXObject:true*/

var utils = require('./../utils');
var buildURL = require('./../helpers/buildURL');
var parseHeaders = require('./../helpers/parseHeaders');
var transformData = require('./../helpers/transformData');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var ieVersion = require('./../helpers/ieVersion');
var btoa = window.btoa || require('./../helpers/btoa');

module.exports = function xhrAdapter(resolve, reject, config) {
  var requestData = config.data;
  var requestHeaders = config.headers;

  if (utils.isFormData(requestData)) {
    delete requestHeaders['Content-Type']; // Let the browser set it
  }

  var Adapter = (XMLHttpRequest || ActiveXObject);
  var loadEvent = 'onreadystatechange';
  var xDomain = false;

  // For IE 8/9 CORS support
  if (ieVersion() <= 9 && !isURLSameOrigin(config.url) && window.XDomainRequest) {
    Adapter = window.XDomainRequest;
    loadEvent = 'onload';
    xDomain = true;
  }

  // HTTP basic authentication
  if (config.auth) {
    var username = config.auth.username || '';
    var password = config.auth.password || '';
    requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
  }

  // Create the request
  var request = new Adapter('Microsoft.XMLHTTP');
  request.open(config.method.toUpperCase(), buildURL(config.url, config.params, config.paramsSerializer), true);

  // Set the request timeout in MS
  request.timeout = config.timeout;

  // Listen for ready state
  request[loadEvent] = function handleReadyState() {
    if (request && (request.readyState === 4 || xDomain)) {
      // Prepare the response
      var responseHeaders = xDomain ? null : parseHeaders(request.getAllResponseHeaders());
      var responseData = ['text', ''].indexOf(config.responseType || '') !== -1 ? request.responseText : request.response;
      var response = {
        data: transformData(
          responseData,
          responseHeaders,
          config.transformResponse
        ),
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config
      };
      // Resolve or reject the Promise based on the status
      ((request.status >= 200 && request.status < 300) || (xDomain && request.responseText) ?
        resolve :
        reject)(response);

      // Clean up request
      request = null;
    }
  };

  // Add xsrf header
  // This is only done if running in a standard browser environment.
  // Specifically not if we're in a web worker, or react-native.
  if (utils.isStandardBrowserEnv()) {
    var cookies = require('./../helpers/cookies');

    // Add xsrf header
    var xsrfValue = config.withCredentials || isURLSameOrigin(config.url) ?
        cookies.read(config.xsrfCookieName) :
        undefined;

    if (xsrfValue) {
      requestHeaders[config.xsrfHeaderName] = xsrfValue;
    }
  }

  // Add headers to the request
  if (!xDomain) {
    utils.forEach(requestHeaders, function setRequestHeader(val, key) {
      if (!requestData && key.toLowerCase() === 'content-type') {
        // Remove Content-Type if data is undefined
        delete requestHeaders[key];
      } else {
        // Otherwise add header to the request
        request.setRequestHeader(key, val);
      }
    });
  }

  // Add withCredentials to request if needed
  if (config.withCredentials) {
    request.withCredentials = true;
  }

  // Add responseType to request if needed
  if (config.responseType) {
    try {
      request.responseType = config.responseType;
    } catch (e) {
      if (request.responseType !== 'json') {
        throw e;
      }
    }
  }

  // Handle progress if needed
  if (config.progress) {
    if (config.method.toLowerCase() === 'post' || config.method.toLowerCase() === 'put') {
      request.upload.addEventListener('progress', config.progress);
    } else if (config.method.toLowerCase() === 'get') {
      request.addEventListener('progress', config.progress);
    }
  }

  if (utils.isArrayBuffer(requestData)) {
    requestData = new DataView(requestData);
  }

  // Send the request
  request.send(requestData);
};
