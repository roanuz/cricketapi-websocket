var https = require('https');
var util = require('util');
var io = require('socket.io-client');

var request = require('request');

var MemcachePlus = require('memcache-plus');

var client = new MemcachePlus(); // localhost:11211

var APP_ID = 'YOUR_APP',
ACCESS_KEY = 'YOUR_ACCESS_KEY',
SECRET_KEY = 'YOUR_SECRET_KEY',
DEVICE_ID = 'TEST_SERVER_1';

var API_HOST = 'rest.cricketapi.com',
    API_PORT = 443,
    API_PREFIX = '/rest/v2/';


var push_servers = [],
    access_token = null;

function auth(onAuth){
  
  var data = util.format(
    'access_key=%s&secret_key=%s&app_id=%s&device_id=%s',
    ACCESS_KEY, SECRET_KEY, APP_ID, DEVICE_ID);

  var post = {
    host: API_HOST, 
    port: API_PORT,
    path: API_PREFIX + 'auth/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': data.length
    }    
  }

  var req = https.request(post, function(res){
    res.setEncoding('utf8');
    res.on('data', function(result){
      onAuth.call(undefined, JSON.parse(result));
      console.log('res', result)
    });
  });

  req.write(data);
  req.end();
}

function getData(source_path, queryParams={}){
  return new Promise((resolve, reject) => { 
    if(queryParams.hasOwnProperty("access_token")) {
       queryParams.access_token = access_token
    } else {
        queryParams['access_token'] = access_token
    }
    
    var reqUrl = 'https://rest.cricketapi.com/rest/v2/'+source_path;
    
    var options = {
        url: reqUrl,
        qs: queryParams,
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        json:true,
        gzip: true
    }
    console.log(options)
    
    request(options, (error, response, body) => {
        if(error) {
            console.log(error)
            reject(error);
        } else {
          // console.log('resData', body.data)
          resolve(body.data); 
        }
    })
  })
}

function connectSocket(){
  var server = push_servers[0];
  var host = 'http://' + server.host + ':' + server.port;
  console.log('Connecting', host);

  var socket = io.connect(host + '/stream');

  socket.on('auth_failed', function(){
    console.log('Auth Failed, consider using new access token. And make sure you have access to the connecting match.');
  });

  socket.on('match_update', function(card){
    // console.log('respnse', card);
    let cache_key = 'match|'+card.key+'|full_card'
    setCache(cache_key, card, card.expires);
    console.log('Got a match update for', card.key);
  });


  socket.on('event', function(){
    console.log('event');
  });

  socket.on('error', function(){
    console.log('error');
  });

  socket.on('connect', function(){
    console.log('Stream Connected');
    getData('recent_matches/').then((dataResponse)=>{
      if(dataResponse && dataResponse != null) {
        console.log('recentMatches', dataResponse.intelligent_order)
        var recentMatches = [];
        if (dataResponse && dataResponse.cards)
          recentMatches = dataResponse.cards;
        if (recentMatches.length > 0) {
          for (var i=0; i<recentMatches.length; i++){
            console.log(i, recentMatches[i].key)
            if (recentMatches[i].status == 'started'){
              socket.emit('auth_match', {'match': recentMatches[i].key, 'access_token': access_token});
            }
          }
        }
      }
    }).catch(function(err) {
        // This will get hit!
        console.error('Oops we have an error', err);
    })
    
  });



};

auth(function(result){

  if(result.auth && result.auth.push_servers){
    push_servers = result.auth.push_servers;
    access_token = result.auth.access_token;
    connectSocket();
      
  }else if(! result.auth){
    console.log('Auth failed.');
  }else{
    console.log('Push notification is not enabled for your app.');
  }

});


function setCache(key, value, ttl) {
  let toDate = new Date();
  toDate = toDate.getTime(); // in timestamp
  let cache_expires = 120
  if(ttl>toDate){
      cache_expires = ttl - toDate / 1000
  }
  client
    .set(key, value, cache_expires)
    .then(function() {
        // This will never happen because an error will be thrown
        console.log('Succeffuly cached data for', key);
    })
    .catch(function(err) {
        // This will get hit!
        console.error('Oops we have an error', err);
    });
}

// getCachedData(cache_key);  // to get data

function getCachedData(key) {
  client
  .get(key)
  .then(function(data) {
      // The user is a JS object:
      console.log('Successfully got the object', data);
      return data;
  });
}
