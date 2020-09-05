if (!location.hash) {
    location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
  }
  const roomHash = location.hash.substring(1);
  
  const drone = new ScaleDrone('b6DBzUwhaA5XaPkS');
  const roomName = 'observable-' + roomHash;
  const configuration = {
    iceServers: [{
      urls: 'stun:stun.l.google.com:19302'
    }],
    peerIdentity:false
  };

  const trackConfiguration = {
    peerIdentity:false
  }

  let room;
  let pc;

  let connections = [];

  let currentStream;
  
  console.log(roomName)
  
  function onSuccess() {};
  function onError(error) {
    console.error(error);
  };
  
  let currID;
  
  drone.on('open', error => {
    if (error) {
      return console.error(error);
    }
    room = drone.subscribe(roomName);
    room.on('open', error => {
      if (error) {
        onError(error);
      }
    });
  
    room.on('members', members => {
      currID = members.length-1;
      console.log(currID);

      if(!connections[currID]) {
        connections[currID] = new RTCPeerConnection(configuration);
      }
  
      navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      }).then(stream => {
  
        localVideo.srcObject = stream;

        let videoId = 2;
  
        for(let i=currID-1; i<=currID+1; i++) {
          if(!connections[i]) {
            console.log("Creating new for "+i);
            connections[i] = new RTCPeerConnection(configuration);
          
            connections[i].onicecandidate = event => {
              if (event.candidate) {
                console.log("sending ice");
                sendMessage({'candidate': event.candidate}, i);
              }
            };
  
            //presenter's track
            if(currID==0) {
              console.log(stream.getTracks());
              stream.getTracks().forEach(track => track.applyConstraints(trackConfiguration).then(() => {
                  console.log(track.peerIdentity, track.isolated);
                  console.log(track.getSettings(), track.getConstraints());
                    connections[i].addTrack(track, stream)
              }));
            }
  
            connections[i].ontrack = event => {
              console.log("video by:"+i);
              const stream = event.streams[0];
              let remoteVideoName = "remoteVideo"+Math.floor(videoId/2);
              videoId++;
              remoteVideo = document.getElementById(remoteVideoName)
              if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
                remoteVideo.srcObject = stream;
              }
  
              // passing on the recieved stream ahead
              if(currID!=0 && i<currID) {
                var newStream = stream.clone();
                // console.log(newStream.getTracks());
                stream.getTracks().forEach(track => connections[currID+1].addTrack(track, stream));
              }
            };
          }
        }

        if(currID>0){
            // console.log(connections[currID-1]);
            // console.log("calling "+(currID-1));
            // // startWebRTC(false, currID-1); //calling previous
            sendMessage({'member_ready':"Memeber ready to recieve"}, currID-1);
        }
    });
  });
  
    room.on('member_join', members => {
      //could be utilized with custom signalling server
    });

    room.on('data', (message, client) => {

        // console.log("Message recieved level 1", message);

        if (client.id === drone.clientId) {
          return;
        }
    
        if(message.destId!=currID) {
          return;
        }
    
        // console.log("recirevdd"+ message.peerId+" "+message.destId);
        // console.log(message);
  
        let pId = message.peerId;
    
        if (message.msg.sdp) {
          connections[pId].setRemoteDescription(new RTCSessionDescription(message.msg.sdp), () => {
            if (connections[pId].remoteDescription.type === 'offer') {
              connections[pId].createAnswer().then(function(description) {
                connections[pId].setLocalDescription(description).then(function() {
                  sendMessage({'sdp': connections[pId].localDescription}, pId);
                }).catch(onError);
            });
            }
          }, onError);
        } else if (message.msg.candidate) {
          connections[pId].addIceCandidate(
            new RTCIceCandidate(message.msg.candidate), onSuccess, onError
          );
        }
        else if(message.msg.member_ready) {
          startWebRTC(true, currID+1); //now call child
        }
      })
  
  });
  
  function sendMessage(message, i) {
    let newMessage = {
      peerId: currID,
      destId : i,
      msg: message
    }
  
    message = newMessage
    console.log("sending this: ", message);
    console.log(roomName);
    drone.publish({
      room: roomName,
      message
    });

    // console.log("send msg funcn done");
  }


  
  function startWebRTC(isOfferer, i) {
    console.log("startwebrtc for "+i+" isoffrere: "+isOfferer);
    // if(!connections[i]) {
    //   connections[i] = new RTCPeerConnection(configuration);
    // }
  
    if (isOfferer) {
        connections[i].createOffer().then(function(description) {
          connections[i].setLocalDescription(description).then(function() {
            sendMessage({'sdp': connections[i].localDescription}, i);
          }).catch(onError);
      });
    }
  }
  
  