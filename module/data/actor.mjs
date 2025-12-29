import { SLA } from "../config.mjs";

export class SlaCharacterData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            biography: new fields.HTMLField(),
            appearance: new fields.HTMLField(),
            notes: new fields.HTMLField(),
            bio: new fields.SchemaField({
                species: new fields.StringField(),
                package: new fields.StringField(),
                squad: new fields.StringField(),
                scl: new fields.StringField(),
                ladAccount: new fields.BooleanField()
            }),
            finance: new fields.SchemaField({
                credits: new fields.NumberField({ initial: 0, min: 0 }),
                unis: new fields.NumberField({ initial: 0, min: 0 }),
                lad: new fields.NumberField({ initial: 0, min: 0 })
            }),
            ratings: new fields.SchemaField({
                body: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: true })
                }),
                brains: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: true })
                }),
                bravado: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: true })
                })
            }),
            stats: new fields.SchemaField({
                str: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                dex: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                know: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                conc: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                cha: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                cool: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                init: new fields.SchemaField({ value: new fields.NumberField({ initial: 0, integer: true }) }),
                luck: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: true }),
                    max: new fields.NumberField({ initial: 0, integer: true })
                }),
                flux: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: true }),
                    max: new fields.NumberField({ initial: 0, integer: true })
                })
            }),
            move: new fields.SchemaField({
                closing: new fields.NumberField({ initial: 0, min: 0 }),
                rushing: new fields.NumberField({ initial: 0, min: 0 })
            }),
            hp: new fields.SchemaField({
                value: new fields.NumberField({ initial: 10, integer: true }),
                max: new fields.NumberField({ initial: 10, integer: true })
            }),
            xp: new fields.SchemaField({
                value: new fields.NumberField({ initial: 0, min: 0, integer: true })
            }),
            encumbrance: new fields.SchemaField({
                value: new fields.NumberField({ initial: 0, min: 0 }),
                max: new fields.NumberField({ initial: 10, min: 0 })
            }),
            wounds: new fields.SchemaField({
                head: new fields.BooleanField({ initial: false }),
                lArm: new fields.BooleanField({ initial: false }),
                rArm: new fields.BooleanField({ initial: false }),
                torso: new fields.BooleanField({ initial: false }),
                lLeg: new fields.BooleanField({ initial: false }),
                rLeg: new fields.BooleanField({ initial: false }),
                conditions: new fields.StringField(),
                penalty: new fields.NumberField({ initial: 0 }),
                damageReduction: new fields.NumberField({ initial: 0 })
            }),
            conditions: new fields.SchemaField({
                bleeding: new fields.BooleanField({ initial: false }),
                burning: new fields.BooleanField({ initial: false }),
                prone: new fields.BooleanField({ initial: false }),
                stunned: new fields.BooleanField({ initial: false }),
                immobile: new fields.BooleanField({ initial: false }),
                critical: new fields.BooleanField({ initial: false })
            }),
            armor: new fields.SchemaField({
                pv: new fields.NumberField({ initial: 0 }),
                resist: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: false }),
                    max: new fields.NumberField({ initial: 0, integer: false })
                })
            })
        };
    }
}

export class SlaNPCData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            bio: new fields.SchemaField({
                species: new fields.StringField(),
                scl: new fields.StringField()
            }),
            stats: new fields.SchemaField({
                str: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                dex: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                know: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                conc: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                cha: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                cool: new fields.SchemaField({ value: new fields.NumberField({ initial: 1, integer: true }) }),
                init: new fields.SchemaField({ value: new fields.NumberField({ initial: 0, integer: true }) }),
                luck: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: true }),
                    max: new fields.NumberField({ initial: 0, integer: true })
                }),
                flux: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: true }),
                    max: new fields.NumberField({ initial: 0, integer: true })
                })
            }),
            hp: new fields.SchemaField({
                value: new fields.NumberField({ initial: 10, integer: true }),
                max: new fields.NumberField({ initial: 10, integer: true })
            }),
            wounds: new fields.SchemaField({
                penalty: new fields.NumberField({ initial: 0 })
            }),
            armor: new fields.SchemaField({
                pv: new fields.NumberField({ initial: 0 }),
                resist: new fields.SchemaField({
                    value: new fields.NumberField({ initial: 0, integer: false }),
                    max: new fields.NumberField({ initial: 0, integer: false })
                })
            }),
            move: new fields.SchemaField({
                closing: new fields.NumberField({ initial: 0, min: 0 }),
                rushing: new fields.NumberField({ initial: 0, min: 0 })
            })
        };
    }
}
