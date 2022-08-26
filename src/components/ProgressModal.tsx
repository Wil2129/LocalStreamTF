import React, {FunctionComponent} from 'react';
import {
  ActivityIndicator,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
} from 'react-native';
import MyModal from './MyModal';

const ProgressModal: FunctionComponent<{
  visible: boolean;
  onDismiss?: (() => void) | undefined;
  onShow?: ((event: NativeSyntheticEvent<any>) => void) | undefined;
}> = ({visible, onDismiss, onShow}) => {
  return (
    <MyModal visible={visible} onShow={onShow} onDismiss={onDismiss}>
      <ActivityIndicator size="large" color="mediumslateblue" />
      <Text style={styles.text}>Connecting...</Text>
    </MyModal>
  );
};

const styles = StyleSheet.create({
  text: {
    marginStart: 24,
    fontSize: 12,
    textAlignVertical: 'center',
  },
});

export default ProgressModal;
