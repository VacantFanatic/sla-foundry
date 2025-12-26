export class SlaItemData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            weight: new fields.NumberField({ initial: 0, min: 0 }),
            price: new fields.NumberField({ initial: 0, min: 0 }),
            quantity: new fields.NumberField({ initial: 1, min: 0, integer: true }),
            equipped: new fields.BooleanField({ initial: false }),
            description: new fields.HTMLField()
        };
    }
}

export class SlaMagazineData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            weight: new fields.NumberField({ initial: 0.5, min: 0 }),
            price: new fields.NumberField({ initial: 10, min: 0 }),
            quantity: new fields.NumberField({ initial: 1, min: 0, integer: true }),
            ammoType: new fields.StringField({ initial: "std" }),
            ammoCapacity: new fields.NumberField({ initial: 30, integer: true }),
            linkedWeapon: new fields.StringField()
        };
    }
}

export class SlaSkillData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            rank: new fields.NumberField({ initial: 0, integer: true }),
            stat: new fields.StringField({ initial: "dex" }),
            xpCost: new fields.NumberField({ initial: 0, min: 0 }),
            description: new fields.HTMLField()
        };
    }
}

export class SlaTraitData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            rank: new fields.NumberField({ initial: 0, integer: true }),
            type: new fields.StringField(),
            xpCost: new fields.NumberField({ initial: 0, min: 0 }),
            description: new fields.HTMLField()
        };
    }
}

export class SlaWeaponData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            damage: new fields.StringField({ initial: "1d10" }),
            minDamage: new fields.StringField({ initial: "0" }),
            ad: new fields.NumberField({ initial: 0 }),
            attackType: new fields.StringField({ initial: "melee" }),
            firingModes: new fields.SchemaField({
                single: new fields.SchemaField({
                    label: new fields.StringField({ initial: "Single" }),
                    active: new fields.BooleanField({ initial: true }),
                    rounds: new fields.NumberField({ initial: 1 }),
                    recoil: new fields.NumberField({ initial: 0 })
                }),
                burst: new fields.SchemaField({
                    label: new fields.StringField({ initial: "Burst" }),
                    active: new fields.BooleanField({ initial: false }),
                    rounds: new fields.NumberField({ initial: 3 }),
                    recoil: new fields.NumberField({ initial: 0 })
                }),
                auto: new fields.SchemaField({
                    label: new fields.StringField({ initial: "Full-Auto" }),
                    active: new fields.BooleanField({ initial: false }),
                    rounds: new fields.NumberField({ initial: 10 }),
                    recoil: new fields.NumberField({ initial: 0 })
                }),
                suppressive: new fields.SchemaField({
                    label: new fields.StringField({ initial: "Suppressive" }),
                    active: new fields.BooleanField({ initial: false }),
                    rounds: new fields.NumberField({ initial: 20 }),
                    recoil: new fields.NumberField({ initial: 0 })
                })
            }),
            range: new fields.StringField({ initial: "10m" }),
            maxAmmo: new fields.NumberField({ initial: 10, integer: true }),
            ammo: new fields.NumberField({ initial: 10, integer: true }),
            skill: new fields.StringField({ initial: "pistol" }),
            weight: new fields.NumberField({ initial: 1, min: 0 }),
            price: new fields.NumberField({ initial: 100, min: 0 }),
            equipped: new fields.BooleanField({ initial: false }),
            description: new fields.HTMLField(),
            ammoType: new fields.StringField()
        };
    }
}

export class SlaArmorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            pv: new fields.NumberField({ initial: 0 }),
            resistance: new fields.SchemaField({
                value: new fields.NumberField({ initial: 10 }),
                max: new fields.NumberField({ initial: 10 })
            }),
            weight: new fields.NumberField({ initial: 2, min: 0 }),
            price: new fields.NumberField({ initial: 200, min: 0 }),
            equipped: new fields.BooleanField({ initial: false }),
            description: new fields.HTMLField(),
            powered: new fields.BooleanField({ initial: false }),
            mods: new fields.SchemaField({
                str: new fields.NumberField({ initial: 0 }),
                dex: new fields.NumberField({ initial: 0 }),
                move: new fields.SchemaField({
                    closing: new fields.NumberField({ initial: 0 }),
                    rushing: new fields.NumberField({ initial: 0 })
                })
            })
        };
    }
}

export class SlaEbbFormulaData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            cost: new fields.NumberField({ initial: 1, min: 0 }),
            formulaRating: new fields.NumberField({ initial: 7 }),
            discipline: new fields.StringField({ initial: "blast" }),
            description: new fields.HTMLField(),
            damage: new fields.StringField(),
            minDamage: new fields.StringField(),
            ad: new fields.NumberField({ initial: 0 }),
            rof: new fields.StringField(),
            recoil: new fields.StringField(),
            range: new fields.StringField(),
            skill: new fields.StringField()
        };
    }
}

export class SlaDisciplineData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            rank: new fields.NumberField({ initial: 0, integer: true }),
            cost: new fields.NumberField({ initial: 0, min: 0 }),
            description: new fields.HTMLField()
        };
    }
}

export class SlaDrugData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            price: new fields.NumberField({ initial: 50, min: 0 }),
            weight: new fields.NumberField({ initial: 0.1, min: 0 }),
            quantity: new fields.NumberField({ initial: 1, min: 0, integer: true }),
            equipped: new fields.BooleanField({ initial: false }),
            addiction: new fields.NumberField({ initial: 10 }),
            addictionDose: new fields.StringField(),
            detoxEffects: new fields.StringField(),
            duration: new fields.StringField(),
            description: new fields.HTMLField()
        };
    }
}

export class SlaSpeciesData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            hp: new fields.NumberField({ initial: 10 }),
            move: new fields.SchemaField({
                closing: new fields.NumberField({ initial: 0 }),
                rushing: new fields.NumberField({ initial: 0 })
            }),
            stats: new fields.SchemaField({
                str: new fields.SchemaField({ min: new fields.NumberField({ initial: 1 }), max: new fields.NumberField({ initial: 10 }) }),
                dex: new fields.SchemaField({ min: new fields.NumberField({ initial: 1 }), max: new fields.NumberField({ initial: 10 }) }),
                know: new fields.SchemaField({ min: new fields.NumberField({ initial: 1 }), max: new fields.NumberField({ initial: 10 }) }),
                conc: new fields.SchemaField({ min: new fields.NumberField({ initial: 1 }), max: new fields.NumberField({ initial: 10 }) }),
                cha: new fields.SchemaField({ min: new fields.NumberField({ initial: 1 }), max: new fields.NumberField({ initial: 10 }) }),
                cool: new fields.SchemaField({ min: new fields.NumberField({ initial: 1 }), max: new fields.NumberField({ initial: 10 }) })
            }),
            skills: new fields.ArrayField(new fields.StringField()),
            description: new fields.HTMLField()
        };
    }
}

export class SlaPackageData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            requirements: new fields.SchemaField({
                str: new fields.NumberField({ initial: 0 }),
                dex: new fields.NumberField({ initial: 0 }),
                know: new fields.NumberField({ initial: 0 }),
                conc: new fields.NumberField({ initial: 0 }),
                cha: new fields.NumberField({ initial: 0 }),
                cool: new fields.NumberField({ initial: 0 })
            }),
            skills: new fields.ArrayField(new fields.StringField()),
            description: new fields.HTMLField()
        };
    }
}
