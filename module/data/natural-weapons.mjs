export const NATURAL_WEAPONS = {
    punchKick: {
        name: "Punch/Kick",
        type: "weapon",
        img: "icons/svg/paw.svg",
        system: {
            damage: "1d10 - 20", // FORCE LOW ROLL
            minDamage: "5",     // MIN DAMAGE TEST
            ad: 0,
            attackType: "melee",
            firingModes: {
                single: { label: "Single", active: true, rounds: 1, recoil: 0 },
            },
            range: "1.5m",
            skill: "unarmed",
            weight: 0,
            price: 0,
            equipped: true,
            description: "<p>Natural unarmed attack.</p>"
        }
    },
    teethClaws: {
        name: "Teeth/Claws (Stormer)",
        type: "weapon",
        img: "icons/svg/paw.svg",
        system: {
            damage: "@stats.str.value - 1",
            minDamage: "2",
            ad: 1,
            attackType: "melee",
            firingModes: {
                single: { label: "Single", active: true, rounds: 1, recoil: 0 },
            },
            range: "1.5m",
            skill: "unarmed",
            weight: 0,
            price: 0,
            equipped: true,
            description: "<p>Natural weapons for Stormers.</p>"
        }
    },
    beak: {
        name: "Beak (Neophron)",
        type: "weapon",
        img: "icons/svg/paw.svg",
        system: {
            damage: "@stats.str.value - 1",
            minDamage: "2",
            ad: 0,
            attackType: "melee",
            firingModes: {
                single: { label: "Single", active: true, rounds: 1, recoil: 0 },
            },
            range: "1.5m",
            skill: "unarmed",
            weight: 0,
            price: 0,
            equipped: true,
            description: "<p>Natural weapon for Neophrons.</p>"
        }
    }
};
