import {createContext} from 'react';
import * as cocoSSd from '@tensorflow-models/coco-ssd';

const AuthContext = createContext<cocoSSd.ObjectDetection | null>(null);

export default AuthContext;
