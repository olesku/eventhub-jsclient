import { Eventhub } from "./Eventhub"

let eventhub = new Eventhub("ws://127.0.0.1:8080", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjIyMTQ2OTQ5MjMsInN1YiI6Im9sZS5za3Vkc3Zpa0BnbWFpbC5jb20iLCJ3cml0ZSI6WyJ0ZXN0MS8jIiwidGVzdDIvIyIsInRlc3QzLyMiXSwicmVhZCI6WyJ0ZXN0MS8jIiwidGVzdDIvIyIsInRlc3QzLyMiXSwiY3JlYXRlVG9rZW4iOlsidGVzdDEiLCJ0ZXN0MiIsInRlc3QzIl19.FSSecEiStcElHu0AqpmcIvfyMElwKZQUkiO5X_r0_3g");

eventhub.connect().then(res=>{

  for (let i = 0; i < 10; i++) {
    eventhub.publish("test1/test", `Event ${i+1}`);
  }

  eventhub.subscribe("test1/test", function (msg) {
    console.log("Callback called msg:", msg);
  }, "0").then(res => {
    console.log("Subscribe success:", res)
  }).catch(res=>{
    console.log("Failed to subscribe:", res);
  });

 /* 
  eventhub.publish("test1/test", "Yo 2!");
  eventhub.publish("test1/test", "Yo 3");

  eventhub.listSubscriptions().then(foo=>{
    console.log("List:", foo);
  });

  eventhub.subscribe("test2/foobar", function (msg) {});
  eventhub.listSubscriptions().then(foo=>{
    console.log("List:", foo);
  });

  setInterval(
  function() {
    eventhub.publish("test1/test", "FOOBAR");
    eventhub.publish("test2/foobar", "BARFOO");
  }, 1000);
*/
}).catch(res=>{
  console.log("Failed to connect:", res);
});

