import { Eventhub } from "./Eventhub"

let eventhub = new Eventhub("ws://127.0.0.1:8080", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjIyMTQ2OTQ5MjMsInN1YiI6Im9sZS5za3Vkc3Zpa0BnbWFpbC5jb20iLCJ3cml0ZSI6WyJ0ZXN0MS8jIiwidGVzdDIvIyIsInRlc3QzLyMiXSwicmVhZCI6WyJ0ZXN0MS8jIiwidGVzdDIvIyIsInRlc3QzLyMiXSwiY3JlYXRlVG9rZW4iOlsidGVzdDEiLCJ0ZXN0MiIsInRlc3QzIl19.FSSecEiStcElHu0AqpmcIvfyMElwKZQUkiO5X_r0_3g");

eventhub.connect().then(res=>{
  eventhub.subscribe(["test1/test", "test2/test"], function (err, msg) {
    if (err) {
      console.log("Callback called err:", err);
    }

    console.log("Callback called msg:", msg);
  });

  console.log(res);
}).catch(res=>{
  console.log("Failed to connect:", res);
});

