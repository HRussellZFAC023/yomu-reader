import { projectWorldPlace } from '../../src/academy/domain/world-locations';
import { completedWorldPracticeEvaluation } from '../../src/academy/domain/world-practice-evidence';

describe('World practice review evidence', () => {
    it('creates an earned canonical review seed for source-grounded current-place replays', () => {
        const progress = { completedScenes: [], completedEncounterIds: [] };
        const cafePractice = projectWorldPlace('cafe', progress).practice!;
        const courtyardPractice = projectWorldPlace('courtyard', progress).practice!;
        const classroomPractice = projectWorldPlace('classroom', progress).practice!;
        const streetPractice = projectWorldPlace('street', progress).practice!;
        const stationPractice = projectWorldPlace('station', progress).practice!;
        const homePractice = projectWorldPlace('home', progress).practice!;
        const konbiniPractice = projectWorldPlace('konbini', progress).practice!;
        const ramenPractice = projectWorldPlace('ramen', progress).practice!;
        const japanCentrePractice = projectWorldPlace('japan-centre', progress).practice!;
        const stationPlatformPractice = projectWorldPlace('station-platform', progress).practice!;
        const bookshopPractice = projectWorldPlace('bookshop', progress).practice!;
        const parkPractice = projectWorldPlace('park', progress).practice!;
        const returningBookshopPractice = projectWorldPlace('bookshop', {
            ...progress,
            worldVisits: { bookshop: 1 },
        }).practice!;
        const returningParkPractice = projectWorldPlace('park', {
            ...progress,
            worldVisits: { park: 1 },
        }).practice!;
        const returningRamenPractice = projectWorldPlace('ramen', {
            ...progress,
            worldVisits: { ramen: 1 },
        }).practice!;
        const returningJapanCentrePractice = projectWorldPlace('japan-centre', {
            ...progress,
            worldVisits: { 'japan-centre': 1 },
        }).practice!;
        const returningStreetPractice = projectWorldPlace('street', {
            ...progress,
            worldVisits: { street: 1 },
        }).practice!;
        const returningHomePractice = projectWorldPlace('home', {
            ...progress,
            worldVisits: { home: 1 },
        }).practice!;
        const returningCourtyardPractice = projectWorldPlace('courtyard', {
            ...progress,
            worldVisits: { courtyard: 1 },
        }).practice!;
        const returningClassroomPractice = projectWorldPlace('classroom', {
            ...progress,
            worldVisits: { classroom: 1 },
        }).practice!;
        const returningStationPlatformPractice = projectWorldPlace('station-platform', {
            ...progress,
            worldVisits: { 'station-platform': 1 },
        }).practice!;

        expect(completedWorldPracticeEvaluation(courtyardPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:courtyard-notice-look',
                conceptIds: ['concept:classroom-look-instruction'],
                sourceQuestionId: 'source-question:classroom-phrase-04',
                responseKind: 'world-token-order',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:courtyard:notice-look',
                sourceQuestionId: 'source-question:classroom-phrase-04',
            })],
        }));
        expect(completedWorldPracticeEvaluation(classroomPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:classroom-board-understanding',
                conceptIds: ['concept:classroom-understanding-check'],
                sourceQuestionId: 'source-question:classroom-phrase-08',
                responseKind: 'world-listening-choice',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:classroom:board-understanding',
                sourceQuestionId: 'source-question:classroom-phrase-08',
            })],
        }));

        expect(completedWorldPracticeEvaluation(cafePractice)).toEqual(expect.objectContaining({
            result: { outcome: 'pass', score: 1, errorTags: [], feedback: { explanation: cafePractice.success } },
            attempt: expect.objectContaining({
                activityId: 'activity:world:cafe-coffee-price',
                conceptIds: ['concept:world:cafe:coffee-price'],
                responseKind: 'world-listening-choice',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:cafe:coffee-price',
                reason: 'new-learning',
                content: expect.objectContaining({ expression: 'コーヒーは三百円です。' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(streetPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:street-cafe-direction',
                conceptIds: ['concept:directions-straight-right'],
                sourceQuestionId: 'activity:aakash-rainy-directions',
                responseKind: 'world-listening-choice',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:street:cafe-direction',
                sourceQuestionId: 'activity:aakash-rainy-directions',
                content: expect.objectContaining({ expression: 'まっすぐ行って、右です。' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(stationPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:station-bookshop-location',
                responseKind: 'world-listening-choice',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:station:bookshop-location',
                content: expect.objectContaining({ expression: '駅の前に本屋があります。' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(homePractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:home-usually-return',
                conceptIds: ['concept:l1-l10:daily-routine:genki-usually-return'],
                sourceQuestionId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-4',
                responseKind: 'world-token-order',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:home:usually-return',
                sourceQuestionId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-4',
            })],
        }));
        expect(completedWorldPracticeEvaluation(konbiniPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:konbini-shirt-price',
                conceptIds: ['concept:l1-l07:shirt-price'],
                sourceQuestionId: 'l1-l07/ex-listen-detail',
                responseKind: 'world-cash-count',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:konbini:shirt-price',
                sourceQuestionId: 'l1-l07/ex-listen-detail',
                content: expect.objectContaining({ expression: 'シャツは ３，０００えん' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(ramenPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:ramen-a43-order-one',
                sourceQuestionId: 'l1-l19/ex-l19-a43-order-1',
                responseKind: 'world-order-grid',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:ramen:a43-order-one',
                sourceQuestionId: 'l1-l19/ex-l19-a43-order-1',
            })],
        }));
        expect(completedWorldPracticeEvaluation(japanCentrePractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:japan-centre-bag-request',
                sourceQuestionId: 'l1-l07/ex-kudasai',
                responseKind: 'world-counter-tag',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:japan-centre:bag-request',
                sourceQuestionId: 'l1-l07/ex-kudasai',
            })],
        }));
        expect(completedWorldPracticeEvaluation(stationPlatformPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:tube-platform-usual-thirty',
                conceptIds: ['concept:l1-l21:commute-comparison:1'],
                sourceQuestionId: 'l1-l21/ex-l21-a46-strike-example',
                responseKind: 'world-listening-choice',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:tube-platform:usual-thirty',
                content: expect.objectContaining({ expression: 'いつも ちかてつで ３０ぷん だけ です。' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(bookshopPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:bookshop-dictionary-available',
                sourceQuestionId: 'moodle:6097314:f7854a77:p2:q2:1',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:bookshop:dictionary-available',
                sourceQuestionId: 'moodle:6097314:f7854a77:p2:q2:1',
            })],
        }));
        expect(completedWorldPracticeEvaluation(parkPractice)).toEqual(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:park-overcast-weather',
                sourceQuestionId: 'genki-2e:l1-l11:lesson-5-workbook-2:slot-9',
                responseKind: 'world-listening-choice',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:park:overcast-weather',
                content: expect.objectContaining({ expression: '天気はよくないです。' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningBookshopPractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:bookshop:small-change-available',
                sourceQuestionId: 'moodle:6097314:f7854a77:p2:q2:4',
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningParkPractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:park:hyde-description',
                sourceQuestionId: 'moodle:6053028:dfec00d8:p1:q1:2',
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningRamenPractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:ramen:a43-order-two',
                sourceQuestionId: 'l1-l19/ex-l19-a43-order-2',
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningJapanCentrePractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:japan-centre:bag-price',
                sourceQuestionId: 'l1-l07/ex-ikura-cloze',
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningStreetPractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:street:station-direction',
                sourceQuestionId: 'aakash-directions:guided-frame',
                content: expect.objectContaining({ expression: 'まっすぐ行って、左です。' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningHomePractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:home:usually-sleep',
                sourceQuestionId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-5',
                content: expect.objectContaining({ expression: 'メアリーさんはたいてい十一時ごろ寝ます。' }),
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningCourtyardPractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:courtyard:notice-write',
                sourceQuestionId: 'source-question:classroom-phrase-07',
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningClassroomPractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:classroom:board-confirmation',
                sourceQuestionId: 'source-question:classroom-phrase-11',
            })],
        }));
        expect(completedWorldPracticeEvaluation(returningStationPlatformPractice)).toEqual(expect.objectContaining({
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:tube-platform:usual-fifteen',
                sourceQuestionId: 'l1-l21/ex-l21-a46-strike-walk-tube',
                content: expect.objectContaining({ expression: 'いつも ちかてつで １５ぷん だけ です。' }),
            })],
        }));
    });
});
