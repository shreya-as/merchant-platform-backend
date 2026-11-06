import {Entity, PrimaryGeneratedColumn, Column, CreateDateColumn} from 'typeorm'

@Entity('roles')
export class Role{
    @PrimaryGeneratedColumn('uuid')
    id:string;

    @Column({unique: true,length:50})
    name:string

    @CreateDateColumn({type:'timestamptz'})
    created_at:Date
}
