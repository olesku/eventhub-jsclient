requirejs(["../dist/eventhub.umd"], function(Eventhub) {
  console.log("Eventhub loaded");
  let eventhub = new Eventhub("ws://127.0.0.1:8080", "myJWTToken");

  eventhub.connect().then(res=>{
    eventhub.subscribe("test/#", function (data) {
      document.write("Callback called:<br>Message: ", data.message, "<br>Topic: ", data.topic, "<br>ID: ", data.id, "<br><br>");
    }).then(res => {
      document.write("Successfully subscribed to ", res.topic, "!<br><br>")
    }).catch(res=>{
      console.log("Failed to subscribe to channel.<br>");
    });

    eventhub.publish("test/myTopic1", "This is a test message!");
    eventhub.publish("test/myTopic2", "This is another test message :)");

    eventhub.listSubscriptions().then(foo=>{
      document.write("<br>List of currenly subscribed topics:<ul>");

      foo.forEach(topicName => {
        document.write("<li>" + topicName + "</li>");
      });

      document.write("</ul>");
    });
  }).catch(res=>{
    console.log("Failed to connect:", res);
  });
});
