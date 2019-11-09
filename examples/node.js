const Eventhub = require('eventhub-jsclient');

/*
   NOTE: Replace myJWTToken with a valid token or start
   the Eventhub server with DISABLE_AUTH=1 for testing.

   You will get a 401 Unauthorized on connect if you don't
   do this.
*/
const evClient = new Eventhub("ws://127.0.0.1:8080", "myJWTToken");

evClient.connect().then(res=>{
  evClient.subscribe("test/#", function (data) {
    console.log("Callback called: Message: ", data);
  }).then(res => {
    console.log("Successfully subscribed to ", res.topic);
  }).catch(res=>{
    console.log("Failed to subscribe to channel.");
  });

  evClient.publish("test/myTopic1", "This is a test message!");
  evClient.publish("test/myTopic2", "This is another test message :)");

  evClient.listSubscriptions().then(foo=>{
    console.log("\nList of currenly subscribed topics:");

    foo.forEach(topicName => {
      console.log(topicName);
    });
  });
}).catch(res=>{
  console.log("Failed to connect:", res);
});