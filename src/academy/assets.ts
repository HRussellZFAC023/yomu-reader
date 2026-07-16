export const ACADEMY_ASSETS = {
    rie: '/academy/art/characters/rie/rie__neutral__halfbody__v001.png',
    rieExpressions: {
        happy: '/academy/art/characters/rie/rie__happy__halfbody__v001.png',
        encouraging: '/academy/art/characters/rie/rie__encouraging__halfbody__v001.png',
        repair: '/academy/art/characters/rie/rie__repair__halfbody__v001.png',
    },
    characters: {
        aakash: '/academy/art/characters/aakash/aakash__neutral__halfbody__v001.png',
        shaun: '/academy/art/characters/shaun/shaun__neutral__halfbody__v001.png',
    },
    portraits: {
        'quality-2': '/academy/art/protagonists/quality-2__picker__v001.png',
        'quality-3': '/academy/art/protagonists/quality-3__picker__v001.png',
        'quality-4': '/academy/art/protagonists/quality-4__picker__v001.png',
        'quality-5': '/academy/art/protagonists/quality-5__picker__v001.png',
    },
    events: {
        rainyDirections: '/academy/art/events/rainy-directions__rie-aakash__v001.png',
    },
    locations: {
        home: {
            wide: '/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp',
            mobile: '/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp',
        },
        entrance: {
            wide: '/academy/art/locations/wide/campus-entrance__blue-hour-arrival--wide.webp',
            mobile: '/academy/art/locations/mobile/campus-entrance__blue-hour-arrival--mobile.webp',
        },
        classroom: {
            wide: '/academy/art/locations/wide/classroom__evening-lamplit--wide.webp',
            mobile: '/academy/art/locations/mobile/classroom__evening-lamplit--mobile.webp',
        },
        library: {
            wide: '/academy/art/locations/wide/library__rain-evening--wide.webp',
            mobile: '/academy/art/locations/mobile/library__rain-evening--mobile.webp',
        },
        cafe: {
            wide: '/academy/art/locations/wide/cafe__night-rain--wide.webp',
            mobile: '/academy/art/locations/mobile/cafe__night-rain--mobile.webp',
        },
        languageLab: {
            wide: '/academy/art/locations/wide/language-lab__evening-listening--wide.webp',
            mobile: '/academy/art/locations/mobile/language-lab__evening-listening--mobile.webp',
        },
        writingStudio: {
            wide: '/academy/art/locations/wide/writing-studio__rain-night--wide.webp',
            mobile: '/academy/art/locations/mobile/writing-studio__rain-night--mobile.webp',
        },
        rainyDirections: {
            wide: '/academy/art/events/rainy-directions__rie-aakash__v001.png',
            mobile: '/academy/art/events/rainy-directions__rie-aakash__v001.png',
        },
    },
} as const;

export type ProtagonistPortraitId = keyof typeof ACADEMY_ASSETS.portraits;
export type AcademyPlateId = keyof typeof ACADEMY_ASSETS.locations;
