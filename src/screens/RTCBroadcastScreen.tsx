import React, {
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';
import ProgressModal from '../components/ProgressModal';
import QRModal from '../components/QRModal';
import {NetworkInfo} from 'react-native-network-info';
import {createServer, Server, Protocol} from '../utils/IPSuite';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';

const RTC_PC_EVENTS = [
  'icecandidate',
  'negotiationneeded',
  'connectionstatechange',
  'iceconnectionstatechange',
  'signalingstatechange',
  'icegatheringstatechange',
];
const MEDIA_CONSTRAINTS = {audio: false, video: true};
const SESSION_CONSTRAINTS = {
  mandatory: {
    OfferToReceiveAudio: false,
    OfferToReceiveVideo: true,
    VoiceActivityDetection: false,
  },
};

const BroadcastScreen = ({
  navigation,
}: {
  navigation: NativeStackNavigationProp<any>;
}) => {
  const pcRef: MutableRefObject<RTCPeerConnection | null> = useRef(null);
  const offerRef: MutableRefObject<RTCSessionDescription | null> = useRef(null);
  const serverRef: MutableRefObject<Server | null> = useRef(null);
  const candidatesRef: MutableRefObject<Array<RTCIceCandidate>> = useRef([]);
  const dataBufferRef = useRef('');

  const [qrModalVisible, setQRModalVisible] = useState(true);
  const [qrValue, setQRValue] = useState({});
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const contextMemo = useMemo(
    () => ({
      onQRError: (error: Error) => {
        console.log(error);
      },
      onProgressModalDismissed: () => setProgressModalVisible(false),
      onQRModalDismissed: () => setQRModalVisible(false),
    }),
    [],
  );

  useEffect(() => {
    let interval: any;

    const init = async () => {
      try {
        const mediaStream = (await mediaDevices.getUserMedia(
          MEDIA_CONSTRAINTS,
        )) as MediaStream;
        setLocalStream(mediaStream);

        if (pcRef.current === null) {
          pcRef.current = new RTCPeerConnection({});
          pcRef.current.addStream(mediaStream);

          pcRef.current.onicecandidate = ({
            candidate,
          }: {
            candidate: RTCIceCandidate;
          }) => {
            // When you find a null candidate then there are no more candidates.
            // Gathering of candidates has finished.
            if (!candidate) {
              console.log('Got final candidate!');
              return;
            }

            candidatesRef.current.push(candidate);
            if (serverRef.current?.connected) {
              const data = JSON.stringify(candidate);
              serverRef.current.send(data, error =>
                console.log(
                  'BROADCAST candidate: ',
                  !error,
                  data.length,
                  error,
                ),
              );
            } else {
              candidatesRef.current.push(candidate);
            }

            // Send the event.candidate onto the person you're calling.
            // Keeping to Trickle ICE Standards, you should send the candidates immediately.
          };
          pcRef.current.onnegotiationneeded = async _event => {
            // You can start the offer stages here.
            // Be careful as this event can be called multiple times.
            console.log('Negotiation Needed (server)', _event);

            if (offerRef.current === null) {
              offerRef.current = (await pcRef.current?.createOffer(
                SESSION_CONSTRAINTS,
              )) as RTCSessionDescription;
            }
            if (
              pcRef.current?.signalingState === 'stable' &&
              serverRef.current?.connected &&
              pcRef.current?.localDescription === null
            ) {
              await pcRef.current.setLocalDescription(offerRef.current);
              const data = JSON.stringify(offerRef.current);
              serverRef.current.send(data, error =>
                console.log('BROADCAST: offer', !error, data.length, error),
              );
            }
          };
          pcRef.current.onconnectionstatechange = _event => {
            console.log(
              `Connection state change (server): ${pcRef.current?.connectionState}`,
            );
            switch (pcRef.current?.connectionState) {
              case 'closed':
                // You can handle the call being disconnected here.
                cleanup();
                init();
                setProgressModalVisible(false);
                setQRModalVisible(true);
                break;
              case 'failed':
                cleanup();
                init();
                setProgressModalVisible(false);
                setQRModalVisible(true);
                break;
            }
          };
          pcRef.current.oniceconnectionstatechange = _event => {
            console.log(
              `ICE connection state change (server): ${pcRef.current?.iceConnectionState}`,
            );
            switch (pcRef.current?.iceConnectionState) {
              case 'connected':
                setProgressModalVisible(false);
                setQRModalVisible(false);
                break;
              case 'completed':
                // You can handle the call being connected here.
                // Like setting the video streams to visible.
                setProgressModalVisible(false);
                setQRModalVisible(false);
                break;
              case 'disconnected':
                cleanup();
                init();
                setProgressModalVisible(false);
                setQRModalVisible(true);
                break;
              case 'failed':
                cleanup();
                init();
                setProgressModalVisible(false);
                setQRModalVisible(true);
                break;
            }
          };
          pcRef.current.onsignalingstatechange = _event => {
            console.log(
              `Signaling state change (server): ${pcRef.current?.signalingState}`,
            );
            switch (pcRef.current?.signalingState) {
              case 'stable':
                console.log(
                  'New RTCPeerConnection or ICE negotiation complete',
                );
                break;
              case 'closed':
                // You can handle the call being disconnected here.
                cleanup();
                init();
                setProgressModalVisible(false);
                setQRModalVisible(true);
                break;
            }
          };
          pcRef.current.onicegatheringstatechange = _event =>
            console.log(
              `ICE gathering state change: ${pcRef.current?.iceGatheringState}`,
            );
        }
      } catch (err) {
        console.log(err);
      }
    };

    const cleanup = () => {
      clearInterval(interval);

      setLocalStream(prevStream => {
        prevStream?.getTracks().map(track => track.stop());
        prevStream = null;
        return prevStream;
      });
      pcRef.current?.getLocalStreams()?.forEach(stream => {
        stream.getTracks().map(track => track.stop());
        pcRef.current?.removeStream(stream);
        stream = null;
      });

      candidatesRef.current = [];
      offerRef.current = null;

      RTC_PC_EVENTS.forEach(rtcEvent =>
        pcRef.current?.removeEventListener(rtcEvent, () => {}),
      );
      pcRef.current?.close();
      pcRef.current = null;

      serverRef.current?.close();

      serverRef.current?.removeAllListeners();
      serverRef.current?.close();
      serverRef.current = null;
    };

    if (serverRef.current === null) {
      const serverPort = Math.floor(Math.random() * 16383) + 49152;
      serverRef.current = createServer(Protocol.UDP);
      serverRef.current
        .on('connected', async () => {
          const {address, port} = serverRef.current?.clientAddress || {};
          console.log(`client connected on ${address}:${port}`);

          interval = setInterval(async () => {
            if (serverRef.current?.connected) {
              if (candidatesRef.current.length > 0) {
                Array.from(candidatesRef.current).forEach((candidate, i) => {
                  const data = JSON.stringify(candidate);
                  serverRef.current?.send(data, error =>
                    console.log(
                      'BROADCAST: candidates',
                      !error,
                      data.length,
                      error,
                    ),
                  );

                  candidatesRef.current.splice(i, 1);
                });
              }
              if (
                pcRef.current?.signalingState === 'stable' &&
                pcRef.current?.localDescription === null
              ) {
                await pcRef.current.setLocalDescription(
                  offerRef.current as RTCSessionDescription,
                );
                const data = JSON.stringify(offerRef.current);
                serverRef.current?.send(data, error =>
                  console.log(
                    'BROADCAST: offer (callback)',
                    !error,
                    data.length,
                    error,
                  ),
                );
              }
            }
          }, 1000);
        })
        .on('message', async dataBuffer => {
          console.log(`server received data: ${dataBuffer.toString().length}`);

          try {
            let dataBufferString = dataBuffer.toString();
            if (dataBufferRef.current.length > 0) {
              dataBufferString = dataBufferRef.current.concat(dataBufferString);
              console.log(
                'Server compressed data: ',
                dataBufferString.slice(-16, 0),
              );
            }
            const data = JSON.parse(dataBufferString);
            dataBufferRef.current = '';
            // console.log('Server decompressed parsed data: ', data);
            if (data && typeof data === 'object') {
              console.log('server received', Object.keys(data));
              if (
                'sdp' in data &&
                typeof data?.sdp === 'string' &&
                pcRef.current?.remoteDescription === null
              ) {
                setProgressModalVisible(true);
                setQRModalVisible(false);
                console.log(
                  'server setRemoteDescription',
                  data.type,
                  data.sdp.slice(0, 16),
                );
                await pcRef.current?.setRemoteDescription(data);
              } else if (
                'candidate' in data &&
                typeof data?.candidate === 'string'
              ) {
                setProgressModalVisible(true);
                setQRModalVisible(false);
                pcRef.current?.addIceCandidate(data);
              } else {
                console.log(
                  'server decompressed parsed data: ',
                  JSON.stringify(data).slice(0, 16),
                  typeof data,
                );
              }
            } else {
              console.log(
                'server decompressed parsed data: ',
                data,
                typeof data,
              );
            }
          } catch (error) {
            console.log('server', error);
            if (error instanceof SyntaxError) {
              dataBufferRef.current = dataBufferRef.current.concat(
                dataBuffer.toString(),
              );
            }
          }
        })
        .on('error', err => {
          console.log(err);
          setProgressModalVisible(false);
          setQRModalVisible(true);
          console.log(`server error ${err}`);
          // navigation.goBack();
        })
        .on('close', () => {
          console.log('client disconnected');
          let timeOut;
          clearTimeout(timeOut);
          timeOut = setTimeout(() => {
            if (!serverRef.current?.connected) {
              setProgressModalVisible(false);
              setQRModalVisible(true);
              console.log('server closed');
              serverRef.current = null;
            }
          }, 1000);
        })
        // .listen({port: 60538, address: '0.0.0.0'}, async () => {
        .listen({port: serverPort, address: '0.0.0.0'}, async () => {
          const {address, port} = serverRef.current?.address() || {};
          console.log(`server listening on ${address}:${port}`);

          // const host = '10.0.2.2';
          const host = (await NetworkInfo.getIPV4Address()) ?? 'localhost';
          // console.log('NetworkInfo', await NetworkInfo.getIPV4Address());
          console.log('server:', {port, address: host});
          setQRValue({port, address: host});
          setQRModalVisible(true);

          init();
        });
    }

    navigation.addListener('beforeRemove', navEvent => {
      navEvent.preventDefault();

      setQRModalVisible(false);
      setProgressModalVisible(false);
      cleanup();

      navigation.dispatch(navEvent.data.action);
    });
    return () => {};
  }, [navigation]);

  return (
    <View style={styles.container}>
      {localStream ? (
        <RTCView
          style={styles.video}
          mirror={true}
          objectFit={'cover'}
          streamURL={localStream.toURL()}
          zOrder={0}
        />
      ) : (
        <View style={styles.video} />
      )}
      <QRModal
        visible={qrModalVisible}
        value={JSON.stringify(qrValue)}
        onError={contextMemo.onQRError}
        onDismiss={contextMemo.onQRModalDismissed}
      />
      <ProgressModal
        visible={progressModalVisible}
        onDismiss={contextMemo.onProgressModalDismissed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  video: {
    flex: 1,
    backgroundColor: 'black',
  },
});

export default BroadcastScreen;
