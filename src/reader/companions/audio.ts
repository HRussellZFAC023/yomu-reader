import { AudioPlayer } from '../audio/player';
import { ReaderAudioActions } from '../audio/actions';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('audio', {
    AudioPlayer,
    ReaderAudioActions,
});
