import Mailjet from 'node-mailjet';
import fs from 'fs';
import Handlebars from 'handlebars';
import path from 'path';
import mjml2html from 'mjml';
import dotenv from 'dotenv';

dotenv.config();

const mailjet = Mailjet.apiConnect(
    process.env.MAILJET_API,
    process.env.MAILJET_SECRET
);

const source = fs.readFileSync(path.resolve('./utils/emails/templates/contactus.mjml'), 'utf8');
const htmlOutput = mjml2html(source);
const template = Handlebars.compile(htmlOutput.html);
const templateData = {
    fullName: 'Mudiaga Obriki',
    email: 'mudiinvents@gmail.com',
    message: 'Hello Mudi'
};

const sendEmail = (toEmail, toName, fromName, fromEmail, subject, textPart, HTMLPart) => {
    const request = mailjet
        .post('send', { version: 'v3.1' })
        .request({
            Messages: [
                {
                    From: {
                        Email: `${fromEmail}`,
                        Name: `${fromName}`
                    },
                    To: [
                        {
                            Email: `${toEmail}`,
                            Name: `${toName}`
                        }
                    ],
                    Subject: `${subject}`,
                    TextPart: `${textPart}`,
                    HTMLPart: `${HTMLPart}`
                }
            ]
        });

    request
        .then(result => {
            console.log(result.body);
            console.log('Message sent successfully!');
        })
        .catch(err => {
            console.log(err.statusCode);
        });
};

export default sendEmail;

// Usage
// sendEmail(
//     'mudiinvents@gmail.com',
//     'Mudiaga Obriki',
//     'Betweysure',
//     'Betweysure <noreply@betweysure.com>',
//     'Welcome to Betweysure',
//     'Welcome Mudi',
//     template(templateData)
// );
