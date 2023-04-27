import * as Vue from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";
import { mixin } from "https://mavue.mavo.io/mavue.js";
import GraffitiPlugin from "https://graffiti.garden/graffiti-js/plugins/vue/plugin.js";
import Resolver from "./resolver.js";

const app = {
  // Import MaVue
  mixins: [mixin],

  // Import resolver
  created() {
    this.resolver = new Resolver(this.$gf);
  },

  setup() {
    // Initialize the name of the channel we're chatting in
    const channel = Vue.ref("default");

    // And a flag for whether or not we're private-messaging
    const privateMessaging = Vue.ref(false);

    // If we're private messaging use "me" as the channel,
    // otherwise use the channel value
    const $gf = Vue.inject("graffiti");
    const context = Vue.computed(() =>
      privateMessaging.value ? [$gf.me] : [channel.value]
    );

    // Initialize the collection of messages associated with the context
    const { objects: messagesRaw } = $gf.useObjects(context);
    return { channel, privateMessaging, messagesRaw };
  },

  data() {
    // Initialize some more reactive variables
    return {
      messageText: "",
      editID: "",
      editText: "",
      recipient: "",

      showHelp: false, // I added this
      hasNewMessages: false, // I added this
      errorMessage: "", //I added this
      requestedUsername: "", // I added this
      requestUsernameResult: "", // I added this

      searchUsername: "", // I added this
      searchResultMessage: "", // I added this
      searching: false, // I added this

      encounteredUsernames: [], // I added this
    };
  },

  computed: {
    messages() {
      let messages = this.messagesRaw
        // Filter the "raw" messages for data
        // that is appropriate for our application
        // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-note
        .filter(
          (m) =>
            // Does the message have a type property?
            m.type &&
            // Is the value of that property 'Note'?
            m.type == "Note" &&
            // Does the message have a content property?
            m.content &&
            // Is that property a string?
            typeof m.content == "string"
        );

      // Do some more filtering for private messaging
      if (this.privateMessaging) {
        messages = messages.filter(
          (m) =>
            // Is the message private?
            m.bto &&
            // Is the message to exactly one person?
            m.bto.length == 1 &&
            // Is the message to the recipient?
            (m.bto[0] == this.recipient ||
              // Or is the message from the recipient?
              m.actor == this.recipient)
        );
      }

      return (
        messages
          // Sort the messages with the
          // most recently created ones first
          .sort((m1, m2) => new Date(m2.published) - new Date(m1.published))
          // Only show the 10 most recent ones
          .slice(0, 10)
      );
    },
    filteredUsernames() {
      return this.encounteredUsernames.filter((username) =>
        username.startsWith(this.searchUsername)
      );
    },

    // unread message
    unreadMessages() {
      return this.hasNewMessages || this.messages.some((msg) => !msg.read); // I added this function
    },
  },

  methods: {
    async requestUsername() {
      try {
        const response = await this.$gf.requestUsername(this.requestedUsername);
        if (response.success) {
          this.requestUsernameResult = "Username successfully claimed!";
        } else {
          this.requestUsernameResult =
            "Username is already taken. Please try another.";
        }
      } catch (error) {
        this.requestUsernameResult =
          "Error claiming username. Please try again.";
      }
    },
    selectUsername(username) {
      this.searchUsername = username;
    },

    async searchForActor() {
      this.searching = true;
      this.searchResultMessage = "";
      try {
        const actorID = await this.resolver.usernameToActor(
          this.searchUsername
        );
        if (actorID) {
          this.recipient = actorID;
          this.searchResultMessage = `Found user with username: ${this.searchUsername}`;

          if (!this.encounteredUsernames.includes(this.searchUsername)) {
            this.encounteredUsernames.push(this.searchUsername);
          }
        } else {
          this.searchResultMessage = "No user found with this username.";
        }
      } catch (error) {
        this.searchResultMessage =
          "Error searching for user. Please try again.";
      } finally {
        this.searching = false;
      }
    },
    // ##################################################################################
    // ###################### Here are the changes I made in methods ####################
    // ##################################################################################

    // // sendMessage(isPrivate)
    // sendMessage(isPrivate) {
    //   if (!this.messageText) {
    //     // if message is empty, error message will be displayed
    //     alert("Error: Message Cannot be Empty! Please write a message. ");
    //     return;
    //   }

    //   const message = {
    //     type: "Note",
    //     content: this.messageText,
    //     // read: false, // mark new messages as unread
    //   };

    //   if (isPrivate) {
    //     message.bto = [this.recipient];
    //     message.context = [this.$gf.me, this.recipient];
    //   } else {
    //     message.context = [this.channel];
    //   }

    //   // clear the message text after sending the messsage
    //   this.messageText = "";

    //   this.$gf.post(message);
    //   //pay a notification sound
    //   const audio = new Audio("new_text.mp3");

    //   audio.play();

    //   //set hasNewMessages to true when new message is sent
    //   this.hasNewMessages = true;
    // },

    sendMessage() {
      const message = {
        type: "Note",
        content: this.messageText,
      };

      // The context field declares which
      // channel(s) the object is posted in
      // You can post in more than one if you want!
      // The bto field makes messages private
      if (this.privateMessaging) {
        message.bto = [this.recipient];
        message.context = [this.$gf.me, this.recipient];
      } else {
        message.context = [this.channel];
      }

      // Send!
      this.$gf.post(message);
    },

    // mark all messages as read when the user opens the chat
    markAllAsRead() {
      this.hasNewMessages = false;
      for (const message of this.messages) {
        if (!message.read) {
          message.read = true;
          this.$gf.post(message); // update the message on the server
        }
      }
    },

    // #################################################################
    // ###################### send message update End ####################
    // #################################################################

    removeMessage(message) {
      this.$gf.remove(message);
    },

    startEditMessage(message) {
      // Mark which message we're editing
      this.editID = message.id;
      // And copy over it's existing text
      this.editText = message.content;
    },

    saveEditMessage(message) {
      // Save the text (which will automatically
      // sync with the server)
      message.content = this.editText;
      // And clear the edit mark
      this.editID = "";
    },
  },
};

const Name = {
  props: ["actor", "editable"],

  setup(props) {
    // Get a collection of all objects associated with the actor
    const { actor } = Vue.toRefs(props);
    const $gf = Vue.inject("graffiti");
    return $gf.useObjects([actor]);
  },

  computed: {
    profile() {
      return (
        this.objects
          // Filter the raw objects for profile data
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
          .filter(
            (m) =>
              // Does the message have a type property?
              m.type &&
              // Is the value of that property 'Profile'?
              m.type == "Profile" &&
              // Does the message have a name property?
              m.name &&
              // Is that property a string?
              typeof m.name == "string"
          )
          // Choose the most recent one or null if none exists
          .reduce(
            (prev, curr) =>
              !prev || curr.published > prev.published ? curr : prev,
            null
          )
      );
    },
    username() {
      return this.actor.split(":").pop();
    },
  },

  data() {
    return {
      editing: false,
      editText: "",
    };
  },

  methods: {
    editName() {
      this.editing = true;
      // If we already have a profile,
      // initialize the edit text to our existing name
      this.editText = this.profile ? this.profile.name : this.editText;
    },

    saveName() {
      if (this.profile) {
        // If we already have a profile, just change the name
        // (this will sync automatically)
        this.profile.name = this.editText;
      } else {
        // Otherwise create a profile
        this.$gf.post({
          type: "Profile",
          name: this.editText,
        });
      }

      // Exit the editing state
      this.editing = false;
    },
  },

  template: "#name",
};

app.components = { Name };
Vue.createApp(app).use(GraffitiPlugin(Vue)).mount("#app");
