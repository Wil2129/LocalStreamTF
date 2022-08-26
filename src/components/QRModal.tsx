import React, {FunctionComponent} from 'react';
import {NativeSyntheticEvent, StyleSheet} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import MyModal from './MyModal';

const QRModal: FunctionComponent<{
  value: string;
  visible: boolean;
  onDismiss?: (() => void) | undefined;
  onShow?: ((event: NativeSyntheticEvent<any>) => void) | undefined;
  onError?: Function;
}> = ({value, visible, onDismiss, onShow, onError}) => {
  return (
    <MyModal
      style={styles.modal}
      visible={visible}
      onShow={onShow}
      onDismiss={onDismiss}>
      <QRCode value={value} onError={onError} size={200} ecl="H" />
    </MyModal>
  );
};

const styles = StyleSheet.create({
  modal: {
    minHeight: 280,
    maxHeight: 560,
  },
});

export default QRModal;
