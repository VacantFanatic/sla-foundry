export const SLA = {};

// 1. SPECIES STATS (Initial & Max)
SLA.speciesStats = {
    "human": {
        label: "Human",
        stats: { 
            str: { min: 1, max: 3 }, 
            dex: { min: 1, max: 4 }, 
            know: { min: 2, max: 5 }, 
            conc: { min: 1, max: 5 }, 
            cha: { min: 1, max: 5 }, 
            cool: { min: 1, max: 5 },
            luck: { min: 1, max: 6 } 
        }
    },
    "frother": {
        label: "Frother",
        stats: { 
            str: { min: 2, max: 4 }, 
            dex: { min: 2, max: 4 }, 
            know: { min: 1, max: 5 }, 
            conc: { min: 1, max: 3 }, 
            cha: { min: 0, max: 4 }, 
            cool: { min: 1, max: 5 },
            luck: { min: 1, max: 3 }
        }
    },
    "ebonite": {
        label: "Ebonite",
        stats: { 
            str: { min: 0, max: 3 }, 
            dex: { min: 1, max: 4 }, 
            know: { min: 1, max: 5 }, 
            conc: { min: 2, max: 6 }, 
            cha: { min: 1, max: 5 }, 
            cool: { min: 1, max: 5 },
            luck: { min: 2, max: 6 }
        }
    },
    "stormer313": {
        label: "Stormer 313 'Malice'",
        stats: { 
            str: { min: 3, max: 6 }, 
            dex: { min: 2, max: 6 }, 
            know: { min: 0, max: 2 }, 
            conc: { min: 0, max: 3 }, 
            cha: { min: 0, max: 3 }, 
            cool: { min: 3, max: 6 },
            luck: { min: 0, max: 2 }
        }
    },
    "stormer711": {
        label: "Stormer 711 'Xeno'",
        stats: { 
            str: { min: 2, max: 5 }, 
            dex: { min: 3, max: 5 }, 
            know: { min: 0, max: 3 }, 
            conc: { min: 1, max: 4 }, 
            cha: { min: 0, max: 2 }, 
            cool: { min: 2, max: 6 },
            luck: { min: 0, max: 2 }
        }
    },
    "shaktar": {
        label: "Shaktar",
        stats: { 
            str: { min: 3, max: 5 }, 
            dex: { min: 2, max: 5 }, 
            know: { min: 1, max: 4 }, 
            conc: { min: 0, max: 3 }, 
            cha: { min: 1, max: 3 }, 
            cool: { min: 1, max: 6 },
            luck: { min: 0, max: 3 }
        }
    },
    "wraithen": {
        label: "Wraithen",
        stats: { 
            str: { min: 1, max: 3 }, 
            dex: { min: 3, max: 6 }, 
            know: { min: 1, max: 4 }, 
            conc: { min: 1, max: 4 }, 
            cha: { min: 1, max: 4 }, 
            cool: { min: 0, max: 5 },
            luck: { min: 1, max: 4 }
        }
    },
    "carrien": {
        label: "Advanced Carrien",
        stats: { 
            str: { min: 3, max: 5 }, 
            dex: { min: 1, max: 5 }, 
            know: { min: 0, max: 2 }, 
            conc: { min: 1, max: 4 }, 
            cha: { min: 0, max: 3 }, 
            cool: { min: 3, max: 6 },
            luck: { min: 0, max: 3 }
        }
    },
    "neophron": {
        label: "Neophron",
        stats: { 
            str: { min: 0, max: 2 }, 
            dex: { min: 0, max: 3 }, 
            know: { min: 2, max: 6 }, 
            conc: { min: 2, max: 6 }, 
            cha: { min: 3, max: 6 }, 
            cool: { min: 1, max: 5 },
            luck: { min: 0, max: 3 }
        }
    }
};

// 2. HELPER LIST FOR DROPDOWNS
SLA.species = Object.keys(SLA.speciesStats).reduce((acc, key) => {
    acc[key] = SLA.speciesStats[key].label;
    return acc;
}, {});