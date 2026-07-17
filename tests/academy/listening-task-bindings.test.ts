import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolvePackagedAcademyListeningLocator } from '../../src/academy/content/listening/listening-crosswalk';
import { resolvePackagedListeningTask } from '../../src/academy/content/listening/listening-task-bindings';
import { adaptAuthoredWeek, AUTHORED_WEEK_HASHES } from '../../src/academy/content/authored-week-adapter';

const PUBLIC_ROOT = path.resolve('public/academy/content/listening');
const DOCS_ROOT = path.resolve('docs/public/academy/content/listening');

describe('Academy exact listening task bindings', () => {
    it('publishes only exact task evidence and gates answers outside the public binding', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_ROOT, 'listening-task-bindings.v1.json'), 'utf8'));

        expect(fs.readFileSync(path.join(DOCS_ROOT, 'listening-task-bindings.v1.json')))
            .toEqual(fs.readFileSync(path.join(PUBLIC_ROOT, 'listening-task-bindings.v1.json')));
        expect(manifest.entries).toHaveLength(74);
        expect(manifest.entries.map((entry: { sourceQuestionId: string }) => entry.sourceQuestionId)).toEqual([
            'ex-soya-n5_mock1_l_19',
            'ex-soya-n5_mock1_l_24',
            'ex-soya-n5_listening_official_002',
            'ex-soya-n5_mock1_l_04',
            'ex-l19-a43-order-1',
            'ex-l19-a43-order-2',
            'ex-l19-a44-car-total',
            'ex-l19-a44-family-total',
            'ex-l19-a44-trip-total',
            'ex-soya-n5_mock1_l_21',
            'ex-l20-a45-miller',
            'ex-l20-a45-ogawa',
            'ex-l20-a45-tawapon',
            'ex-soya-n5_listening_024',
            'ex-soya-n5_mock1_l_11',
            'ex-l21-a46-strike-example',
            'ex-l21-a46-strike-walk-bus-tube',
            'ex-l21-a46-strike-walk-tube',
            'ex-soya-n5_listening_011',
            'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-1',
            'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-2',
            'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-3',
            'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-4',
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-1',
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-2',
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-3',
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-4',
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-5',
            'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-1',
            'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-2',
            'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-3',
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-1',
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-2',
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-3',
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-4',
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-1',
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-2',
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-3',
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-4',
            'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-5',
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-1',
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-2',
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-3',
            'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-4',
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-1',
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-2',
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-3',
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-4',
            'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-5',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-1',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-2',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-3',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-4',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-5',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-6',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-7',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:blank-8',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p1:track78-bank:choice',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p2:track79-favor-direction:item-1',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p2:track79-favor-direction:item-2',
            'moodle:8121261:3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617:pdf-p2:track79-favor-direction:item-3',
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-1',
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-2',
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-3',
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-4',
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-5',
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-6',
            'moodle:8121266:3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9:pdf-p1:a11-meal-survey:item-7',
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a13-state-correction:item-1',
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a13-state-correction:item-2',
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a13-state-correction:item-3',
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a14-defect-replacement:item-1',
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a14-defect-replacement:item-2',
            'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a14-defect-replacement:item-3',
        ]);
        expect(manifest.entries[0]).toMatchObject({
            packageId: 'l1-l01',
            verification: {
                answerGate: 'after-attempt',
                taskEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
                supportEvidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            },
            learnerContract: {
                response: 'single-choice',
                transcriptReveal: 'after-attempt',
                hintReveal: 'after-attempt',
                grading: 'deterministic',
            },
            delivery: { status: 'packaged-static' },
        });
        expect(manifest.gaps).toEqual([]);
        expect(manifest.entries.filter((entry: { learnerContract: { response: string } }) =>
            entry.learnerContract.response === 'structured-grid')).toHaveLength(5);
        expect(manifest.entries.filter((entry: { learnerContract: { response: string } }) =>
            entry.learnerContract.response === 'comparison-log')).toHaveLength(3);
        expect(manifest.entries.filter((entry: { learnerContract: { response: string } }) =>
            entry.learnerContract.response === 'speaker-shelf')).toHaveLength(4);
        expect(manifest.entries.filter((entry: { learnerContract: { response: string } }) =>
            entry.learnerContract.response === 'structured-cloze')).toHaveLength(12);
        expect(manifest.entries.filter((entry: { learnerContract: { response: string } }) =>
            entry.learnerContract.response === 'direction-phrase')).toHaveLength(3);
        expect(manifest.entries.filter((entry: { learnerContract: { response: string } }) =>
            entry.learnerContract.response === 'conversation-check')).toHaveLength(13);
        expect(manifest.entries.filter((entry: { learnerContract: { response: string } }) =>
            entry.learnerContract.response === 'true-false')).toHaveLength(10);
        expect(JSON.stringify(manifest)).not.toMatch(/"correct"|"correctAnswer"|"answers"|"transcript"/i);
    });

    it('matches every playable task to the same verified crosswalk source', () => {
        const bindings = JSON.parse(fs.readFileSync(path.join(PUBLIC_ROOT, 'listening-task-bindings.v1.json'), 'utf8')) as {
            entries: Array<{
                locator: string;
                source: { corpus: string; audioSha256: string; questionMapRef: string };
                delivery: { status: string; url?: string };
            }>;
        };
        const crosswalk = JSON.parse(fs.readFileSync(path.join(PUBLIC_ROOT, 'listening-crosswalk.v1.json'), 'utf8')) as {
            entries: Array<{
                locator: string;
                availability: string;
                source?: { corpus: string; sha256: string; questionMapRef: string };
                delivery?: { mode: string; url: string };
            }>;
        };
        const verifiedByLocator = new Map(crosswalk.entries.map(entry => [entry.locator, entry]));

        for (const binding of bindings.entries.filter(entry => entry.delivery.status === 'packaged-static')) {
            expect(verifiedByLocator.get(binding.locator)).toMatchObject({
                availability: 'source-verified',
                source: {
                    corpus: binding.source.corpus,
                    sha256: binding.source.audioSha256,
                    questionMapRef: binding.source.questionMapRef,
                },
                delivery: { mode: 'packaged-static', url: binding.delivery.url },
            });
        }
    });

    it('ships byte-verified offline MP3s and resolves each only for its exact task', () => {
        const cases = [
            {
                packageId: 'l1-l01',
                questionId: 'ex-soya-n5_mock1_l_19',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_19.mp3',
                url: '/academy/content/listening/media/academy-listening-75194e1fda2886b7.mp3',
                sha256: '75194e1fda2886b794a28669948455eb8ab4e45acba4a246221bde5e681cbe15',
            },
            {
                packageId: 'l1-l01',
                questionId: 'ex-soya-n5_mock1_l_24',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_24.mp3',
                url: '/academy/content/listening/media/academy-listening-52ba9cd972e544ef.mp3',
                sha256: '52ba9cd972e544efb6017cbe220dfa04989565c3f1730e4e42fe81193b107455',
            },
            {
                packageId: 'l1-l18',
                questionId: 'ex-soya-n5_listening_official_002',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_listening_official_002.mp3',
                url: '/academy/content/listening/media/academy-listening-f1c2bbdb7c54893a.mp3',
                sha256: 'f1c2bbdb7c54893a6b7852082829ddb40c69c0fa543de0c74fb7a418383fdd65',
            },
            {
                packageId: 'l1-l18',
                questionId: 'ex-soya-n5_mock1_l_04',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_04.mp3',
                url: '/academy/content/listening/media/academy-listening-da546db7dbceaf3ea.mp3',
                sha256: 'da546db7dbceaf3eafbe21f69767f2c954d831817fe3f3307c7deb24be12c664',
            },
            {
                packageId: 'l1-l19',
                questionId: 'ex-soya-n5_mock1_l_21',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_21.mp3',
                url: '/academy/content/listening/media/academy-listening-3cffc675cee2c613.mp3',
                sha256: '3cffc675cee2c61361523cb028df25b4b4cf4969ac21cf87169ab12b7b133391',
            },
            {
                packageId: 'l1-l19',
                questionId: 'ex-l19-a43-order-1',
                locator: 'academy/content/moodle/audio/l1-l19-a43.mp3',
                url: '/academy/content/listening/media/academy-listening-75b031947b395f44.mp3',
                sha256: '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372',
            },
            {
                packageId: 'l1-l19',
                questionId: 'ex-l19-a44-family-total',
                locator: 'academy/content/moodle/audio/l1-l19-a44.mp3',
                url: '/academy/content/listening/media/academy-listening-b076fb0e90d9e1b2.mp3',
                sha256: 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd',
            },
            {
                packageId: 'l1-l20',
                questionId: 'ex-l20-a45-ogawa',
                locator: 'academy/content/moodle/audio/l1-l20-a45.mp3',
                url: '/academy/content/listening/media/academy-listening-7a7f9cf7c9d0a109.mp3',
                sha256: '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8',
            },
            {
                packageId: 'l1-l20',
                questionId: 'ex-l20-a45-miller',
                locator: 'academy/content/moodle/audio/l1-l20-a45.mp3',
                url: '/academy/content/listening/media/academy-listening-7a7f9cf7c9d0a109.mp3',
                sha256: '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8',
            },
            {
                packageId: 'l1-l20',
                questionId: 'ex-l20-a45-tawapon',
                locator: 'academy/content/moodle/audio/l1-l20-a45.mp3',
                url: '/academy/content/listening/media/academy-listening-7a7f9cf7c9d0a109.mp3',
                sha256: '7a7f9cf7c9d0a10932007df1528f10fdfd7c0f38fe59bb938aa7a6952ccc47c8',
            },
            {
                packageId: 'l1-l20',
                questionId: 'ex-soya-n5_mock1_l_11',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_11.mp3',
                url: '/academy/content/listening/media/academy-listening-32c6d0a7692f3d5a.mp3',
                sha256: '32c6d0a7692f3d5aec633c615f2c1b727deda0859e5f492fd3f444b56f029ac8',
            },
            {
                packageId: 'l1-l20',
                questionId: 'ex-soya-n5_listening_024',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_listening_024.mp3',
                url: '/academy/content/listening/media/academy-listening-d35a4c49f74efa82.mp3',
                sha256: 'd35a4c49f74efa8295f0c11c077acb58e276007e3224d8f9e277fc96d63505ba',
            },
            {
                packageId: 'l1-l21',
                questionId: 'ex-l21-a46-strike-example',
                locator: 'academy/content/moodle/audio/l1-l21-a46.mp3',
                url: '/academy/content/listening/media/academy-listening-4f292de0dd3a5791.mp3',
                sha256: '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97',
            },
            {
                packageId: 'l1-l21',
                questionId: 'ex-l21-a46-strike-walk-tube',
                locator: 'academy/content/moodle/audio/l1-l21-a46.mp3',
                url: '/academy/content/listening/media/academy-listening-4f292de0dd3a5791.mp3',
                sha256: '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97',
            },
            {
                packageId: 'l1-l21',
                questionId: 'ex-l21-a46-strike-walk-bus-tube',
                locator: 'academy/content/moodle/audio/l1-l21-a46.mp3',
                url: '/academy/content/listening/media/academy-listening-4f292de0dd3a5791.mp3',
                sha256: '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97',
            },
            {
                packageId: 'l1-l21',
                questionId: 'ex-soya-n5_listening_011',
                locator: 'academy/content/soya/audio/jlpt_n5/n5_listening_011.mp3',
                url: '/academy/content/listening/media/academy-listening-ebaab3b679eaf07d.mp3',
                sha256: 'ebaab3b679eaf07d2fb1035cb7582d95e4985379235d24dea59bfa88a48db888',
            },
            {
                packageId: 'l2-l03',
                questionId: 'moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-1',
                locator: 'academy/content/moodle/audio/l2-l03-b22.mp3',
                url: '/academy/content/listening/media/academy-listening-6dccd9517dc4e10f.mp3',
                sha256: '6dccd9517dc4e10fb1ce3548de2c3c9d07a498f12bbf6e5b734b0e56c1490e6b',
            },
            {
                packageId: 'l2-l05',
                questionId: 'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-1',
                locator: 'academy/content/moodle/audio/l2-l05-b25.mp3',
                url: '/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3',
                sha256: '2e5d1ee1e18a31b72e826670a3f6aec1c0f513a6e2f05b654e04b199ad4939f3',
            },
            {
                packageId: 'l2-l05',
                questionId: 'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-1',
                locator: 'academy/content/minna/audio/l2-l05-minna-069.mp3',
                url: '/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3',
                sha256: 'f423d074fd31d9efaf34b359c71fde870abc71b850379af3a526758cee9b5d30',
            },
            {
                packageId: 'l2-l06',
                questionId: 'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-1',
                locator: 'academy/content/minna/audio/l2-l06-minna-072.mp3',
                url: '/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3',
                sha256: '71cd9a20f51a1c49a53f02fc6080914e6cf229662710f55bd8f9f2dac269d98c',
            },
            {
                packageId: 'l2-l07',
                questionId: 'moodle:6974653:2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0:audio:minna074-mondai-2:item-1',
                locator: 'academy/content/minna/audio/l2-l07-minna-074.mp3',
                url: '/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3',
                sha256: '2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0',
            },
            {
                packageId: 'l2-l09',
                questionId: 'moodle:6974657:c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0:pdf-p1:minna075-conversation:item-1',
                locator: 'academy/content/minna/audio/l2-l09-minna-075.mp3',
                url: '/academy/content/listening/media/academy-listening-360cef1923b1e824.mp3',
                sha256: '360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834',
            },
            {
                packageId: 'l2-l10',
                questionId: 'moodle:6974659:3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339:audio:minna077-mondai-2:item-1',
                locator: 'academy/content/minna/audio/l2-l10-minna-077.mp3',
                url: '/academy/content/listening/media/academy-listening-3be2ca818292e685.mp3',
                sha256: '3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339',
            },
            {
                packageId: 'l2-l14',
                questionId: 'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a13-state-correction:item-1',
                locator: 'academy/content/moodle/audio/l2-l14-a13.mp3',
                url: '/academy/content/listening/media/academy-listening-b61ec5374c6c31fb.mp3',
                sha256: 'b61ec5374c6c31fb3c1d3cef4fee142e0b6ee2d79e5a7359d70df65f93d44d2d',
            },
            {
                packageId: 'l2-l14',
                questionId: 'moodle:8121267:a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499:pdf-p1:a14-defect-replacement:item-1',
                locator: 'academy/content/moodle/audio/l2-l14-a14.mp3',
                url: '/academy/content/listening/media/academy-listening-72537c6e4c3eb82b.mp3',
                sha256: '72537c6e4c3eb82bb6800a4c52ec906abb0c7b58f94b1663573426289e62cf2d',
            },
        ];
        for (const item of cases) {
            expect(resolvePackagedAcademyListeningLocator(item.locator)).toMatchObject({ status: 'ready', url: item.url });
            expect(resolvePackagedListeningTask(item.packageId, item.questionId, item.locator)).toBe(item.url);
            const publicAsset = path.resolve('public', item.url.replace(/^\//u, ''));
            const docsAsset = path.resolve('docs/public', item.url.replace(/^\//u, ''));
            const bytes = fs.readFileSync(publicAsset);
            expect(fs.readFileSync(docsAsset)).toEqual(bytes);
            expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
        }
        expect(resolvePackagedListeningTask('l1-l18', cases[0].questionId, cases[1].locator)).toBeUndefined();
        expect(resolvePackagedListeningTask('l1-l20', cases[2].questionId, cases[3].locator)).toBeUndefined();
        expect(resolvePackagedListeningTask('l1-l21', cases.at(-1)!.questionId, cases[6].locator)).toBeUndefined();
        expect(resolvePackagedListeningTask('l1-l20', 'ex-l20-a45-ogawa', 'academy/content/lessons/l1-l20/moodle-minna-039.mp3')).toBeUndefined();
    });

    it('delivers one stable slice with gated transcript, corrective hints, grading, and provenance', () => {
        const lessonPath = path.resolve('public/academy/content/lessons/019-l1-l18.json');
        const lessonBytes = fs.readFileSync(lessonPath);
        const lessonSha256 = crypto.createHash('sha256').update(lessonBytes).digest('hex');
        expect(lessonSha256).toBe(AUTHORED_WEEK_HASHES['l1-l18']);
        const week = adaptAuthoredWeek(JSON.parse(lessonBytes.toString('utf8')), {
            path: 'public/academy/content/lessons/019-l1-l18.json',
            sha256: lessonSha256,
        });
        const activity = week.activities.find(candidate => candidate.sourceQuestionId.endsWith('/ex-soya-n5_listening_official_002'))!;

        expect(activity).toMatchObject({
            kind: 'choice',
            listening: {
                url: '/academy/content/listening/media/academy-listening-f1c2bbdb7c54893a.mp3',
                transcriptReveal: 'after-attempt',
                transcript: expect.arrayContaining([
                    expect.objectContaining({ speaker: '女', text: expect.stringContaining('りんごは ４つ') }),
                ]),
            },
            provenance: { packageId: 'l1-l18', sourceQuestionId: 'l1-l18/ex-soya-n5_listening_official_002' },
        });
        expect(JSON.stringify(activity)).not.toMatch(/"correct"|"answer"/i);

        const wrong = week.evaluate(activity.id, 'soya-option-1');
        expect(wrong.result).toMatchObject({
            outcome: 'lapse',
            score: 0,
            feedback: {
                explanation: { en: expect.stringContaining('corrected'), ja: expect.stringContaining('答え') },
                repairPrompt: { en: expect.stringContaining('Try once more') },
            },
        });
        expect(week.evaluate(activity.id, 'soya-option-2').result).toMatchObject({ outcome: 'pass', score: 1 });
        expect(week.provenance).toMatchObject({ packageId: 'l1-l18', source: { sha256: AUTHORED_WEEK_HASHES['l1-l18'] } });
    });

    it('binds the next exact Soya task to l1-l19 with gated support, grading, and provenance', () => {
        const lessonPath = path.resolve('public/academy/content/lessons/020-l1-l19.json');
        const lessonBytes = fs.readFileSync(lessonPath);
        const lessonSha256 = crypto.createHash('sha256').update(lessonBytes).digest('hex');
        expect(lessonSha256).toBe(AUTHORED_WEEK_HASHES['l1-l19']);

        const lesson = JSON.parse(lessonBytes.toString('utf8'));
        const docsLesson = JSON.parse(fs.readFileSync('docs/public/academy/content/lessons/020-l1-l19.json', 'utf8'));
        expect(findExercise(docsLesson, 'ex-soya-n5_mock1_l_21')).toEqual(findExercise(lesson, 'ex-soya-n5_mock1_l_21'));

        const week = adaptAuthoredWeek(lesson, { path: 'public/academy/content/lessons/020-l1-l19.json', sha256: lessonSha256 });
        const activity = week.activities.find(candidate => candidate.sourceQuestionId.endsWith('/ex-soya-n5_mock1_l_21'))!;
        expect(activity).toMatchObject({
            kind: 'choice',
            listening: {
                sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_21.mp3',
                url: '/academy/content/listening/media/academy-listening-3cffc675cee2c613.mp3',
                transcriptReveal: 'after-attempt',
                transcript: [
                    { speaker: '男の人', text: '駅まで 歩いて 何分ですか。' },
                    { speaker: '女の人', text: '１。１５分です。' },
                    { speaker: '女の人', text: '２。１５分 あります。' },
                    { speaker: '女の人', text: '３。１５分 かかります。' },
                ],
            },
            provenance: { packageId: 'l1-l19', sourceQuestionId: 'l1-l19/ex-soya-n5_mock1_l_21' },
        });
        expect(JSON.stringify(activity)).not.toMatch(/"correct"|"answer"/i);
        expect(week.evaluate(activity.id, 'soya-option-1').result).toMatchObject({ outcome: 'lapse', score: 0 });
        expect(week.evaluate(activity.id, 'soya-option-3').result).toMatchObject({ outcome: 'pass', score: 1 });
        expect(week.provenance).toMatchObject({ packageId: 'l1-l19', source: { sha256: AUTHORED_WEEK_HASHES['l1-l19'] } });
    });

    it('binds the remaining verified Soya tasks to their Level 1 lesson journeys without exposing answers', () => {
        const cases = [
            {
                packageId: 'l1-l20' as const,
                lessonFile: '021-l1-l20.json',
                questionId: 'ex-soya-n5_mock1_l_11',
                sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_mock1_l_11.mp3',
                url: '/academy/content/listening/media/academy-listening-32c6d0a7692f3d5a.mp3',
                transcript: { speaker: '男の人', text: 'りんごも みかんも すきですが、いちばん 好きなのは ぶどうです。' },
                wrong: 'soya-option-1',
                correct: 'soya-option-3',
            },
            {
                packageId: 'l1-l20' as const,
                lessonFile: '021-l1-l20.json',
                questionId: 'ex-soya-n5_listening_024',
                sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_listening_024.mp3',
                url: '/academy/content/listening/media/academy-listening-d35a4c49f74efa82.mp3',
                transcript: { speaker: '男', text: '寿司(すし)が一番(いちばん)好きです。毎週(まいしゅう)食べます。' },
                wrong: 'soya-option-1',
                correct: 'soya-option-2',
            },
            {
                packageId: 'l1-l21' as const,
                lessonFile: '022-l1-l21.json',
                questionId: 'ex-soya-n5_listening_011',
                sourceLocator: 'academy/content/soya/audio/jlpt_n5/n5_listening_011.mp3',
                url: '/academy/content/listening/media/academy-listening-ebaab3b679eaf07d.mp3',
                transcript: { speaker: '男', text: '4人(よにん)です。父(ちち)と母(はは)と姉(あね)と私(わたし)です。' },
                wrong: 'soya-option-1',
                correct: 'soya-option-2',
            },
        ];

        for (const item of cases) {
            const lessonPath = path.resolve('public/academy/content/lessons', item.lessonFile);
            const lessonBytes = fs.readFileSync(lessonPath);
            const lessonSha256 = crypto.createHash('sha256').update(lessonBytes).digest('hex');
            expect(lessonSha256).toBe(AUTHORED_WEEK_HASHES[item.packageId]);
            expect(fs.readFileSync(path.resolve('docs/public/academy/content/lessons', item.lessonFile)))
                .toEqual(lessonBytes);

            const week = adaptAuthoredWeek(JSON.parse(lessonBytes.toString('utf8')), { path: lessonPath, sha256: lessonSha256 });
            const activity = week.activities.find(candidate => candidate.sourceQuestionId.endsWith(`/${item.questionId}`))!;
            expect(activity).toMatchObject({
                kind: 'choice',
                listening: {
                    sourceLocator: item.sourceLocator,
                    url: item.url,
                    transcriptReveal: 'after-attempt',
                    transcript: expect.arrayContaining([item.transcript]),
                },
                provenance: { packageId: item.packageId, sourceQuestionId: `${item.packageId}/${item.questionId}` },
            });
            expect(JSON.stringify(activity)).not.toMatch(/"correct"|"answer"/i);
            expect(week.evaluate(activity.id, item.wrong).result).toMatchObject({ outcome: 'lapse', score: 0 });
            expect(week.evaluate(activity.id, item.correct).result).toMatchObject({ outcome: 'pass', score: 1 });
        }
    });

    it('binds the three exact Moodle A-45 worksheet tasks with post-attempt-only support', () => {
        const lessonPath = path.resolve('public/academy/content/lessons/021-l1-l20.json');
        const lessonBytes = fs.readFileSync(lessonPath);
        const lessonSha256 = crypto.createHash('sha256').update(lessonBytes).digest('hex');
        expect(lessonSha256).toBe(AUTHORED_WEEK_HASHES['l1-l20']);
        expect(fs.readFileSync('docs/public/academy/content/lessons/021-l1-l20.json')).toEqual(lessonBytes);

        const week = adaptAuthoredWeek(JSON.parse(lessonBytes.toString('utf8')), { path: lessonPath, sha256: lessonSha256 });
        const cases = [
            { id: 'ex-l20-a45-ogawa', wrong: 'moodle-a45-ogawa-3', correct: 'moodle-a45-ogawa-5', text: '朝ごはんと 昼ごはんと 晩ごはんを 食べます。' },
            { id: 'ex-l20-a45-miller', wrong: 'moodle-a45-miller-1', correct: 'moodle-a45-miller-10', text: '８月と １２月は 行きません。' },
            { id: 'ex-l20-a45-tawapon', wrong: 'moodle-a45-tawapon-4', correct: 'moodle-a45-tawapon-5', text: '火曜日と 金曜日は 休みます。' },
        ];
        for (const item of cases) {
            const activity = week.activities.find(candidate => candidate.sourceQuestionId === `l1-l20/${item.id}`)!;
            expect(activity).toMatchObject({
                kind: 'choice',
                listening: {
                    sourceLocator: 'academy/content/moodle/audio/l1-l20-a45.mp3',
                    url: '/academy/content/listening/media/academy-listening-7a7f9cf7c9d0a109.mp3',
                    transcriptReveal: 'after-attempt',
                    transcript: expect.arrayContaining([expect.objectContaining({ text: item.text })]),
                },
            });
            expect(JSON.stringify(activity)).not.toMatch(/"correct"|"answer"/i);
            expect(week.evaluate(activity.id, item.wrong).result).toMatchObject({ outcome: 'lapse', score: 0 });
            expect(week.evaluate(activity.id, item.correct).result).toMatchObject({ outcome: 'pass', score: 1 });
        }
    });
});

function findExercise(lesson: { components: readonly { exercises?: readonly { id: string }[] }[] }, id: string): unknown {
    return lesson.components.flatMap(component => component.exercises ?? []).find(exercise => exercise.id === id);
}
