// services/FlightEmailService.js - Streamlined without repetition
import sendEmail from './emails.js';
import fs from 'fs';
import mjml2html from 'mjml';
import Handlebars from 'handlebars';
import { format } from 'date-fns';
import path from 'path';

/**
 * Streamlined Flight Email Service - DRY Principle Applied
 */
class FlightEmailService {
    constructor() {
        this.fromAddress = process.env.FLIGHT_EMAIL_FROM || process.env.FROM_EMAIL;
        this.fromName = process.env.FLIGHT_EMAIL_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Surepay Flights';

        // Single configuration object
        this.config = {
            confirmation: { template: 'flightBookingConfirmation', fallback: 'billPaymentSuccess', subject: 'Flight Booking Confirmed' },
            cancellation: { template: 'flightBookingCancellation', fallback: 'billPaymentFailed', subject: 'Flight Booking Cancelled' },
            update: { template: 'flightBookingUpdate', fallback: 'billPaymentSuccess', subject: 'Flight Update' }
        };
    }

    /**
     * Single method for all email types
     */
    async sendFlightEmail(type, data, user) {
        const cfg = this.config[type];
        if (!cfg) throw new Error(`Unknown email type: ${type}`);

        const templateData = this.buildTemplateData(type, data, user);
        const subject = `${cfg.subject} - ${data.booking?.bookingReference || data.bookingReference}`;
        const template = await this.loadTemplate(cfg.template, cfg.fallback);

        await sendEmail(
            user.email,
            user.firstName || user.username || '',
            process.env.APPLICATION_NAME || 'Surepay',
            `${this.fromName} <${this.fromAddress}>`,
            subject,
            '',
            template(templateData)
        );

        console.log(`Flight ${type} email sent:`, user.email);
        return { success: true };
    }

    /**
     * Public API methods (just delegates)
     */
    sendBookingConfirmation = (data, user) => this.sendFlightEmail('confirmation', data, user);
    sendCancellationEmail = (data, user) => this.sendFlightEmail('cancellation', data, user);
    sendFlightUpdateEmail = (data, user) => this.sendFlightEmail('update', data, user);

    /**
     * Load MJML template with fallback
     */
    async loadTemplate(templateName, fallback) {
        const paths = [
            `./utils/emails/templates/${templateName}.mjml`,
            `./utils/emails/templates/${fallback}.mjml`
        ];

        for (const templatePath of paths) {
            try {
                const source = fs.readFileSync(path.resolve(templatePath), 'utf8');
                const { html } = mjml2html(source);
                return Handlebars.compile(html);
            } catch (err) {
                continue;
            }
        }
        throw new Error('No email template found');
    }

    /**
     * Build template data based on type
     */
    buildTemplateData(type, data, user) {
        const base = this.getBaseData(data, user);

        const typeSpecific = {
            confirmation: {
                pnr: data.pnr,
                canCancel: data.booking.canCancel(),
                refundAmount: this.formatAmount(data.booking.calculateRefund()),
                vtpassMessage: 'Your flight has been successfully booked.'
            },
            cancellation: {
                cancellationReason: data.cancellationReason,
                refundAmount: this.formatAmount(data.refundAmount || 0),
                cancellationFee: this.formatAmount(data.booking.totalAmount - (data.refundAmount || 0)),
                errorMessage: (data.refundAmount || 0) > 0 ? 'Refund processed.' : 'No refund available.'
            },
            update: {
                updateType: data.updateType,
                changes: data.changes,
                vtpassMessage: `Update: ${data.updateType}. ${data.changes}`
            }
        };

        return { ...base, ...typeSpecific[type] };
    }

    /**
     * Generate base template data (used by all email types)
     */
    getBaseData(data, user) {
        const booking = data.booking;
        const outbound = booking.flights[0];
        const returnFlight = booking.flights[1];

        return {
            firstName: user.firstName || user.username || 'Customer',
            serviceName: `${outbound.airline} Flight ${outbound.flightNumber}`,
            serviceImage: this.getAirlineImage(outbound.airlineCode),
            amount: this.formatAmount(booking.totalAmount),
            transactionRef: booking.transactionRef,
            transactionDate: format(new Date(), 'PPP p'),
            phone: booking.contactInfo.phone,
            bookingReference: booking.bookingReference,
            passengerCount: booking.passengers.length,

            flightRoute: returnFlight
                ? `${outbound.origin.code} ⇄ ${outbound.destination.code}`
                : `${outbound.origin.code} → ${outbound.destination.code}`,

            outboundFlight: this.formatFlight(outbound),
            returnFlight: returnFlight ? this.formatFlight(returnFlight) : null,

            passengers: booking.passengers.map((p, i) => ({
                number: i + 1,
                name: `${p.title} ${p.firstName} ${p.lastName}`,
                type: p.type
            })),

            transactionHistoryUrl: `${process.env.FRONT_END_URL}/transactions`,
            appName: process.env.APPLICATION_NAME || 'Surepay',
            appLogo: process.env.APP_LOGO_URL || `https://via.placeholder.com/350x100/0b3d6f/FFFFFF?text=${encodeURIComponent(process.env.APPLICATION_NAME || 'HOVAPAY')}`
        };
    }

    /**
     * Format flight details
     */
    formatFlight(flight) {
        const dept = new Date(flight.departureTime);
        const arr = new Date(flight.arrivalTime);

        return {
            airline: flight.airline,
            flightNumber: flight.flightNumber,
            from: `${flight.origin.city} (${flight.origin.code})`,
            to: `${flight.destination.city} (${flight.destination.code})`,
            departureDate: format(dept, 'PPP'),
            departureTime: format(dept, 'p'),
            arrivalDate: format(arr, 'PPP'),
            arrivalTime: format(arr, 'p'),
            duration: flight.duration
        };
    }

    /**
     * Format amount
     */
    formatAmount(amount) {
        return new Intl.NumberFormat('en-NG', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount || 0);
    }

    /**
     * Get airline image
     */
    getAirlineImage(code) {
        const images = {
            'BA': 'https://via.placeholder.com/200x150/1434CB/FFFFFF?text=BRITISH+AIRWAYS',
            'LH': 'https://via.placeholder.com/200x150/F9BA00/000000?text=LUFTHANSA',
            'AF': 'https://via.placeholder.com/200x150/004194/FFFFFF?text=AIR+FRANCE'
        };
        return images[code] || `https://via.placeholder.com/200x150/0b3d6f/FFFFFF?text=${encodeURIComponent(code)}`;
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            if (!process.env.FROM_EMAIL) throw new Error('FROM_EMAIL not set');
            mjml2html('<mjml><mj-body><mj-section><mj-column><mj-text>Test</mj-text></mj-column></mj-section></mj-body></mjml>');
            return { success: true, message: 'Service ready' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export default new FlightEmailService();
export { FlightEmailService };

// Simple integration function for sendEmails.js
export const sendFlightBookingEmail = async (data, user, type) => {
    const service = new FlightEmailService();
    return await service.sendFlightEmail(type, data, user);
};