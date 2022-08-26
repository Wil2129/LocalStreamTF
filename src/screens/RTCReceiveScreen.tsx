import React, {
  MutableRefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  PixelRatio,
  Image,
} from 'react-native';
import Button from '../components/Button';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from 'react-native-webrtc';
import ProgressModal from '../components/ProgressModal';
import {fetch, decodeJpeg} from '@tensorflow/tfjs-react-native';
import {BarCodeScanner} from 'expo-barcode-scanner';
import {createClient, Client, Protocol} from '../utils/IPSuite';
import {captureRef, releaseCapture} from 'react-native-view-shot';
import Canvas, {CanvasRenderingContext2D} from 'react-native-canvas';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import ModelContext from '../context/ModelContext';

const SIGNALING_ANSWER_STATES = ['have-remote-offer', 'have-local-pranswer'];
const RTC_PC_EVENTS = [
  'addstream',
  'icecandidate',
  'negotiationneeded',
  'connectionstatechange',
  'iceconnectionstatechange',
  'signalingstatechange',
  'icegatheringstatechange',
];

const ReceiveScreen = ({
  navigation,
}: {
  navigation?: NativeStackNavigationProp<any>;
}) => {
  const {height, width} = useWindowDimensions();
  const pixelRatio = PixelRatio.get();
  const model = useContext(ModelContext);

  const pcRef: MutableRefObject<RTCPeerConnection | null> = useRef(null);
  const clientRef: MutableRefObject<Client | null> = useRef(null);
  const candidatesRef: MutableRefObject<Array<RTCIceCandidate>> = useRef([]);
  const dataBufferRef = useRef('');
  const videoViewRef = useRef(null);
  const canvasRef: MutableRefObject<Canvas | null> = useRef(null);
  const ctxRef: MutableRefObject<CanvasRenderingContext2D | null> =
    useRef(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream>(
    new MediaStream(undefined),
  );
  const [offer, setOffer] = useState<RTCSessionDescription | null>(null);

  const contextMemo = useMemo(
    () => ({
      handleBarCodeScanned: async ({data: qrData}: {data: string}) => {
        setScanned(true);
        setProgressModalVisible(true);
        const connectOptions = JSON.parse(qrData);
        clientRef.current = createClient(Protocol.UDP, connectOptions, () => {
          console.log('connected to server');
        })
          .on('message', async dataBuffer => {
            console.log(
              `client received data: ${dataBuffer.toString().length}`,
            );

            try {
              let dataBufferString = dataBuffer.toString();
              if (dataBufferRef.current.length > 0) {
                dataBufferString =
                  dataBufferRef.current.concat(dataBufferString);
              }
              const data = JSON.parse(dataBufferString);
              dataBufferRef.current.length &&
                console.log('Data buffer decompress success');
              dataBufferRef.current = '';
              if (data && typeof data === 'object') {
                console.log('client received', Object.keys(data));
                if (
                  'sdp' in data &&
                  typeof data?.sdp === 'string' &&
                  pcRef.current?.remoteDescription === null
                ) {
                  console.log(
                    'client remote description',
                    data.type,
                    JSON.stringify(data).slice(0, 16),
                  );
                  if (pcRef.current?.signalingState === 'stable') {
                    await pcRef.current?.setRemoteDescription(data);
                    console.log('client setRemoteDescription success');
                    setOffer(data);
                  }
                  if (
                    SIGNALING_ANSWER_STATES.includes(
                      pcRef.current?.signalingState,
                    ) &&
                    pcRef.current?.localDescription === null &&
                    clientRef.current?.destroyed === false
                  ) {
                    const answer = await pcRef.current?.createAnswer();
                    await pcRef.current?.setLocalDescription(
                      answer as RTCSessionDescription,
                    );

                    const compressedData = JSON.stringify(answer);
                    clientRef.current?.send(compressedData, error => {
                      console.log(
                        'RECEIVE answer: ',
                        !error,
                        compressedData.length,
                        error,
                      );
                    });
                  }
                } else if (
                  'candidate' in data &&
                  typeof data?.candidate === 'string'
                ) {
                  pcRef.current?.addIceCandidate(data);
                } else {
                  console.log(
                    'Client decompressed parsed data: ',
                    JSON.stringify(data).slice(0, 16),
                    typeof data,
                  );
                }
              } else {
                console.log(
                  'Client decompressed parsed data: ',
                  data,
                  typeof data,
                );
              }
            } catch (error) {
              console.log('client', error);
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
            candidatesRef.current = [];
            setScanned(false);
            // pcRef.current?.close();
          })
          .on('close', () => {
            console.log('disconnected from server');
            setProgressModalVisible(false);
            candidatesRef.current = [];
            setScanned(false);
            // pcRef.current?.close();
            // clientRef.current?.reconnect(1000, () => {
            //   console.log('reconnected to server');
            // });
            // let closeTimeout;
            // clearTimeout(closeTimeout);

            // closeTimeout = setTimeout(() => {
            //   setProgressModalVisible(false);
            //   candidatesRef.current = [];
            //   // pcRef.current?.close();
            //   setScanned(false);
            // }, 1000);
          });

        if (
          candidatesRef.current.length > 0 &&
          clientRef.current?.destroyed === false
        ) {
          Array.from(candidatesRef.current).forEach((candidate, i) => {
            const data = JSON.stringify(candidate);
            clientRef.current?.send(data, error =>
              console.log('RECEIVE: candidates', !error, data.length, error),
            );
            candidatesRef.current.splice(i, 1);
          });
        }
      },
      onProgressModalDismissed: () => setProgressModalVisible(false),
      handleCanvas: (canvas: Canvas) => {
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas?.getContext('2d');
          ctx.lineWidth = 4;

          canvasRef.current = canvas;
          ctxRef.current = ctx;
        }
      },
      reset: () => {
        setProgressModalVisible(false);
        clientRef.current?.destroy();
        setScanned(false);
      },
    }),
    [height, width],
  );

  useEffect(() => {
    let interval: any;

    const init = async () => {
      try {
        const {status} = await BarCodeScanner.requestPermissionsAsync();
        setHasPermission(status === 'granted');

        if (pcRef.current === null) {
          pcRef.current = new RTCPeerConnection({});
          pcRef.current?.addStream(new MediaStream(undefined));

          pcRef.current.onaddstream = ({stream}: {stream: MediaStream}) => {
            // Grab the remote stream from the connected participant.
            setRemoteStream(stream);
          };
          pcRef.current.onconnectionstatechange = _event => {
            console.log(
              `Connection state change (client): ${pcRef.current?.connectionState}`,
            );
            switch (pcRef.current?.connectionState) {
              case 'closed':
                // You can handle the call being disconnected here.
                contextMemo.reset()
                break;
              case 'failed':
                contextMemo.reset()
                break;
            }
          };
          pcRef.current.oniceconnectionstatechange = _event => {
            console.log(
              `ICE connection state change (client): ${pcRef.current?.iceConnectionState}`,
            );
            switch (pcRef.current?.iceConnectionState) {
              case 'connected':
                setProgressModalVisible(false);
                clearInterval(interval);
                interval = setInterval(async () => {
                  // console.log(!!model);
                  if (model && canvasRef.current && ctxRef.current) {
                    try {
                      const uri = await captureRef(videoViewRef, {
                        format: 'jpg',
                        quality: 0.8,
                        width: Math.floor(width / pixelRatio),
                        height: Math.floor(height / pixelRatio),
                      });
                      console.log('Image saved to', uri);
                      const response = await fetch(
                        Image.resolveAssetSource({uri}).uri,
                        {},
                        {isBinary: true},
                      );
                      const imageData = new Uint8Array(
                        await response.arrayBuffer(),
                      );
                      const imageTensor = decodeJpeg(imageData);
                      const predictions = await model.detect(imageTensor);
                      const scaleX = width / imageTensor.shape[1];
                      const scaleY = height / imageTensor.shape[0];
                      ctxRef.current?.clearRect(0, 0, width, height);
                      console.log(predictions);
                      predictions.forEach(prediction => {
                        if (ctxRef.current) {
                          const color = `#${Math.floor(
                            Math.random() * 16777215,
                          ).toString(16)}`;
                          ctxRef.current.strokeStyle = color;
                          ctxRef.current.fillStyle = color;
                          const [x, y, boxWidth, boxHeight] = prediction.bbox;
                          ctxRef.current?.strokeRect(
                            x * scaleX,
                            y * scaleY,
                            boxWidth * scaleX,
                            boxHeight * scaleY,
                          );
                          ctxRef.current?.fillText(
                            `${prediction.class} - ${(
                              prediction.score * 100
                            ).toFixed(2)}%`,
                            x * scaleX,
                            y * scaleY,
                            boxWidth * scaleX,
                          );
                        }
                      });
                      releaseCapture(uri);
                    } catch (error) {
                      console.log(error);
                    }
                  }
                }, Math.ceil(1000 / 5));
                break;
              case 'completed':
                // You can handle the call being connected here.
                // Like setting the video streams to visible.
                setProgressModalVisible(false);
                break;
              case 'disconnected':
                contextMemo.reset()
                break;
              case 'failed':
                contextMemo.reset()
                break;
            }
          };
          pcRef.current.onsignalingstatechange = async _event => {
            console.log(
              `Signaling state change (client): ${pcRef.current?.signalingState}`,
            );
            switch (pcRef.current?.signalingState) {
              case 'stable':
                console.log(
                  'New RTCPeerConnection or ICE negotiation complete',
                );
                break;
              case 'closed':
                // You can handle the call being disconnected here.
                contextMemo.reset()
                break;
            }
          };
          pcRef.current.onicegatheringstatechange = _event =>
            console.log(
              `ICE gathering state change: ${pcRef.current?.iceGatheringState}`,
            );
          pcRef.current.onicecandidate = ({
            candidate,
          }: {
            candidate: RTCIceCandidate;
          }) => {
            if (!candidate) {
              return;
            }

            if (clientRef.current?.destroyed === false) {
              const data = JSON.stringify(candidate);
              clientRef.current?.send(data, error =>
                console.log('RECEIVE candidate: ', !error, data.length, error),
              );
            } else {
              candidatesRef.current.push(candidate);
            }
          };
          pcRef.current.onnegotiationneeded = async _event => {
            console.log('Negotiation Needed (client)', _event);
          };
        }
      } catch (err) {
        console.log(err);
      }
    };

    interval = setInterval(async () => {
      if (
        candidatesRef.current.length > 0 &&
        clientRef.current?.destroyed === false
      ) {
        Array.from(candidatesRef.current).forEach((candidate, i) => {
          const data = JSON.stringify(candidate);
          clientRef.current?.send(data, error => {
            console.log('RECEIVE: candidates', !error, data.length, error);
            !error && candidatesRef.current.splice(i, 1);
          });
        });
      }
    }, 1000);

    init();
    // contextMemo.handleBarCodeScanned({
    //   data: JSON.stringify({port: 60538, address: '10.0.2.2'}),
    // });

    navigation?.addListener('beforeRemove', navEvent => {
      navEvent.preventDefault();

      clearInterval(interval);
      setProgressModalVisible(false);
      candidatesRef.current = [];

      RTC_PC_EVENTS.forEach(rtcEvent =>
        pcRef.current?.removeEventListener(rtcEvent, () => {}),
      );
      pcRef.current?.close();
      pcRef.current = null;

      clientRef.current?.destroy();
      clientRef.current = null;

      navigation.dispatch(navEvent.data.action);
    });

    return () => {};
  }, [contextMemo, height, model, navigation, pixelRatio, width]);

  return (
    <View style={styles.container}>
      {hasPermission === null ? (
        <Text>Requesting for camera permission</Text>
      ) : hasPermission === false ? (
        <Text>No access to camera</Text>
      ) : scanned &&
        offer !== null &&
        offer?.sdp?.length > 0 &&
        // remoteStream.getTracks()[0] &&
        remoteStream ? (
        <>
          <View style={styles.video} collapsable={false} ref={videoViewRef}>
            <RTCView
              style={styles.video}
              mirror={true}
              objectFit={'cover'}
              streamURL={remoteStream.toURL()}
              zOrder={0}
            />
          </View>
          <Canvas style={styles.canvas} ref={contextMemo.handleCanvas} />
        </>
      ) : (
        <View style={styles.scannerContainer}>
          <BarCodeScanner
            barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
            onBarCodeScanned={
              scanned ? undefined : contextMemo.handleBarCodeScanned
            }
            style={StyleSheet.absoluteFillObject}
          />
          {scanned && (
            <Button
              title={'Tap to Scan Again'}
              style={styles.scanButton}
              onPress={() => {
                clientRef.current?.destroy();
                setScanned(false);
              }}
            />
          )}
        </View>
      )}
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
    margin: 0,
    padding: 0,
  },
  video: {
    flex: 1,
    margin: 0,
    padding: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: -5,
  },
  scannerContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  scanButton: {
    marginHorizontal: 24,
  },
});

export default ReceiveScreen;
