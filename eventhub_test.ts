import { Eventhub } from "./Eventhub"

let eventhub = new Eventhub("ws://127.0.0.1:8080", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjIyMTQ2OTQ5MjMsInN1YiI6Im9sZS5za3Vkc3Zpa0BnbWFpbC5jb20iLCJ3cml0ZSI6WyJ0ZXN0MS8jIiwidGVzdDIvIyIsInRlc3QzLyMiXSwicmVhZCI6WyJ0ZXN0MS8jIiwidGVzdDIvIyIsInRlc3QzLyMiXSwiY3JlYXRlVG9rZW4iOlsidGVzdDEiLCJ0ZXN0MiIsInRlc3QzIl19.FSSecEiStcElHu0AqpmcIvfyMElwKZQUkiO5X_r0_3g");

eventhub.connect().then(res=>{
  eventhub.subscribe(["test1/#", "test2/nisse"], function (msg) {
    console.log("Callback called msg:", msg);
  }).then(res => {
    console.log("Subscribe success:", res)
  }).catch(res=>{
    console.log("Failed to subscribe:", res);
  });;

  eventhub.listSubscriptions().then(foo=>{
    console.log("List:", foo);
  });

  eventhub.unsubscribe("test1/testt");
  eventhub.subscribe("test2/foobar", function (msg) {});
  eventhub.listSubscriptions().then(foo=>{
    console.log("List:", foo);
  });

  setInterval(
  function() {
    eventhub.publish("test1/test", "FOOBAR");
    eventhub.publish("test2/nisse", "BARFOO");
  }, 1000);

}).catch(res=>{
  console.log("Failed to connect:", res);
});

