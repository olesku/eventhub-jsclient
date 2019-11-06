var Eventhub = require("../dist/eventhub.js");
let eventhub = new Eventhub("ws://127.0.0.1:8080", "myJWTToken");

eventhub.connect().then(res=>{
  eventhub.subscribe("test/#", function (data) {
    console.log("Callback called: Message: ", data);
  }).then(res => {
    console.log("Successfully subscribed to ", res.topic);
  }).catch(res=>{
    console.log("Failed to subscribe to channel.");
  });

  eventhub.publish("test/myTopic1", "This is a test message!");
  eventhub.publish("test/myTopic2", "This is another test message :)");

  eventhub.listSubscriptions().then(foo=>{
    console.log("\nList of currenly subscribed topics:");

    foo.forEach(topicName => {
      console.log(topicName);
    });
  });
}).catch(res=>{
  console.log("Failed to connect:", res);
});
