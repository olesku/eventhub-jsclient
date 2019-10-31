declare type SubscriptionCallback = (err: object, message: object) => void;

export class Eventhub {
  private websocketUri: string;
  private authToken: string;

  private subscriptionCallbacks: Array<SubscriptionCallback>;

  /*
  function subscribe(topics: string);
  function subscribe(topics: Array<string>);
*/

  constructor (uri: string, token: string) {

  }

  public subscribe(topics: Array<string>|string, callback: SubscriptionCallback) : void {
    if (typeof(topics) == 'string') {
      console.log("Subscribe to single topic.");
    } else {
      console.log("Subscribe to multiple topics.");
    }
  }

  public unsubscribe(topics: Array<string>|string) : void {

  }


  public unsubscribeAll() : number {

    return 0;
  }

  public listSubscriptions() : Array<string> {

    return [];
  }
}

